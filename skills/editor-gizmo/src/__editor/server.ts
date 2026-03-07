/**
 * Auth-server entry point.
 * Syncs scene entities, loads/saves overrides, manages locks, authorizes admins.
 */

import { engine, Entity, Transform, Name, PlayerIdentityData, RealmInfo, executeTask } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Storage, EnvVar } from '@dcl/sdk/server'
import { editorRoom } from './messages'

// ── Entity discovery ────────────────────────────────────
// Scans all entities with Name + Transform. Works for both
// code-created entities and composite-loaded entities.

const namedEntities = new Map<string, Entity>()

function discoverNamedEntities() {
  for (const [entity] of engine.getEntitiesWith(Name, Transform)) {
    const name = Name.get(entity).value
    if (name && !namedEntities.has(name)) {
      namedEntities.set(name, entity)
    }
  }
  console.log(`[server] discovered ${namedEntities.size} named entities`)
}

// ── Admin list ──────────────────────────────────────────

let adminWallets: string[] = []
let isPreview = false

async function loadAdminList() {
  // Check RealmInfo first — it's synchronous and available early
  const realm = RealmInfo.getOrNull(engine.RootEntity)
  isPreview = realm?.isPreview ?? true // default to preview if unknown

  if (isPreview) {
    console.log('[server] preview mode — everyone is admin')
    return
  }

  // Only fetch EnvVar in deployed mode (avoids hanging getRealm in preview)
  try {
    const raw = await EnvVar.get('ADMIN_WALLETS')
    if (raw) {
      adminWallets = raw.split(',').map(w => w.trim().toLowerCase()).filter(w => w.length > 0)
      console.log(`[server] loaded ${adminWallets.length} admin wallet(s)`)
      return
    }
  } catch {}
  console.log('[server] ADMIN_WALLETS not set — everyone is admin')
}

function isAdmin(address: string): boolean {
  if (isPreview || adminWallets.length === 0) return true
  return adminWallets.includes(address.toLowerCase())
}

// ── Lock management ─────────────────────────────────────

/** entityName → admin wallet address */
const lockMap = new Map<string, string>()

// ── Transform data ──────────────────────────────────────

interface TransformData {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  scale: { x: number; y: number; z: number }
}

type OverrideMap = Record<string, TransformData>

const originalTransforms = new Map<string, TransformData>()

function captureOriginalTransforms() {
  for (const [name, entity] of namedEntities) {
    if (!Transform.has(entity)) continue
    const t = Transform.get(entity)
    originalTransforms.set(name, {
      position: { x: t.position.x, y: t.position.y, z: t.position.z },
      rotation: { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z, w: t.rotation.w },
      scale: { x: t.scale.x, y: t.scale.y, z: t.scale.z },
    })
  }
}

// ── Persistence backend ─────────────────────────────────

interface PersistenceBackend {
  load(): Promise<OverrideMap>
  /** Save a transform override. Pass undefined to remove (reset to code default). */
  save(entityName: string, transform: TransformData | undefined): Promise<void>
}

/** Deployed mode — keeps full override map in memory, debounces writes to Storage. */
class StorageBackend implements PersistenceBackend {
  private overrides: OverrideMap = {}
  private dirty = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly FLUSH_DELAY = 2000

  async load(): Promise<OverrideMap> {
    try {
      this.overrides = (await Storage.get<OverrideMap>('editor-overrides')) ?? {}
    } catch {
      this.overrides = {}
    }
    return this.overrides
  }

  async save(entityName: string, transform: TransformData | undefined) {
    if (transform) this.overrides[entityName] = transform
    else delete this.overrides[entityName]

    this.dirty = true
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        executeTask(() => this.flush())
      }, this.FLUSH_DELAY)
    }
  }

  private async flush() {
    if (!this.dirty) return
    this.dirty = false
    await Storage.set('editor-overrides', this.overrides)
    console.log(`[server] flushed overrides to storage`)
  }
}

/** Preview mode — forwards changes to sdk-commands for editor-scene.json export. */
class PreviewBackend implements PersistenceBackend {
  private ws: WebSocket | null = null
  private baseUrl: string = ''

  connect(baseUrl: string) {
    this.baseUrl = baseUrl
    try {
      const wsUrl = baseUrl.replace(/^http/, 'ws')
      this.ws = new WebSocket(wsUrl)
      this.ws.onopen = () => console.log('[server] preview ws connected')
      this.ws.onclose = () => { this.ws = null }
      this.ws.onerror = () => { this.ws = null }
    } catch {
      console.log('[server] WebSocket not available — falling back to fetch')
      this.ws = null
    }
  }

  async load(): Promise<OverrideMap> {
    if (!this.baseUrl) return {}
    try {
      const res = await fetch(`${this.baseUrl}/editor/changes`)
      if (!res.ok) return {}
      const data = await res.json() as Record<string, { components: { Transform: TransformData } }>
      const overrides: OverrideMap = {}
      for (const [name, entry] of Object.entries(data)) {
        if (entry?.components?.Transform) {
          overrides[name] = entry.components.Transform
        }
      }
      const count = Object.keys(overrides).length
      if (count > 0) {
        console.log(`[server] loaded ${count} overrides from preview server`)
      }
      return overrides
    } catch (e) {
      console.log(`[server] load overrides failed: ${e}`)
      return {}
    }
  }

  async save(entityName: string, transform: TransformData | undefined) {
    if (!transform) return

    // Try WebSocket first (instant), fall back to fetch POST
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'editor-update',
        name: entityName,
        components: { Transform: transform },
      }))
      return
    }

    if (!this.baseUrl) return
    try {
      await fetch(`${this.baseUrl}/editor/changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [entityName]: { components: { Transform: transform } } }),
      })
    } catch {}
  }
}

let persistence: PersistenceBackend = new StorageBackend()

// ── Transform validation ────────────────────────────────
// We do NOT call syncEntity (that would clone composite entities).
// But we DO add validateBeforeChange to protect entities that the
// scene itself may have synced. If an entity isn't synced, the
// callback never fires — it's a harmless no-op.

type ComponentWithValidation = {
  validateBeforeChange: (entity: Entity, cb: (value: { senderAddress: string }) => boolean) => void
}

function protectTransforms() {
  for (const [name, entity] of namedEntities) {
    ;(Transform as unknown as ComponentWithValidation).validateBeforeChange(entity, (value) => {
      if (value.senderAddress === AUTH_SERVER_PEER_ID) return true
      const lockHolder = lockMap.get(name)
      return lockHolder !== undefined && lockHolder === value.senderAddress
    })
  }
}

// ── Apply override to entity ────────────────────────────

function applyOverride(name: string, override: TransformData) {
  const entity = namedEntities.get(name)
  if (!entity || !Transform.has(entity)) return

  const t = Transform.getMutable(entity)
  t.position.x = override.position.x; t.position.y = override.position.y; t.position.z = override.position.z
  t.rotation.x = override.rotation.x; t.rotation.y = override.rotation.y; t.rotation.z = override.rotation.z; t.rotation.w = override.rotation.w
  t.scale.x = override.scale.x; t.scale.y = override.scale.y; t.scale.z = override.scale.z
}

// ── Player tracking ─────────────────────────────────────

const connectedAdmins = new Set<string>()

function playerDisconnectSystem() {
  const currentAddresses = new Set<string>()
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    currentAddresses.add(PlayerIdentityData.get(entity).address)
  }
  const disconnected: string[] = []
  for (const addr of connectedAdmins) {
    if (!currentAddresses.has(addr)) disconnected.push(addr)
  }
  for (const addr of disconnected) {
    connectedAdmins.delete(addr)
    releaseAllLocks(addr)
    console.log(`[server] player ${addr.substring(0, 10)}... left`)
  }
}

function releaseAllLocks(address: string) {
  const toRelease: string[] = []
  for (const [entityName, holder] of lockMap) {
    if (holder === address) toRelease.push(entityName)
  }
  for (const entityName of toRelease) {
    lockMap.delete(entityName)
    editorRoom.send('editorUnlocked', { entityName })
    console.log(`[server] auto-released lock on "${entityName}"`)
  }
}

// ── Message handlers ────────────────────────────────────

function registerHandlers() {
  editorRoom.onMessage('editorReady', (_data, context) => {
    if (!context) return
    const addr = context.from
    const admin = isAdmin(addr)
    editorRoom.send('editorEnable', { admin, address: addr }, { to: [addr] })
    console.log(`[server] player ${addr.substring(0, 10)}... ready — admin: ${admin}`)

    if (admin) {
      connectedAdmins.add(addr)
      for (const [entityName, lockedBy] of lockMap) {
        editorRoom.send('editorLocked', { entityName, lockedBy }, { to: [addr] })
      }
    }
  })

  editorRoom.onMessage('editorLock', (data, context) => {
    if (!context) return
    const addr = context.from
    if (!isAdmin(addr)) return

    const { entityName } = data
    if (!namedEntities.has(entityName)) return

    const currentHolder = lockMap.get(entityName)
    if (currentHolder && currentHolder !== addr) {
      editorRoom.send('editorLocked', { entityName, lockedBy: currentHolder }, { to: [addr] })
      return
    }

    lockMap.set(entityName, addr)
    editorRoom.send('editorLocked', { entityName, lockedBy: addr })
    console.log(`[server] "${entityName}" locked by ${addr.substring(0, 10)}...`)
  })

  editorRoom.onMessage('editorUnlock', (data, context) => {
    if (!context) return
    const addr = context.from
    const { entityName } = data

    const currentHolder = lockMap.get(entityName)
    if (currentHolder !== addr) return

    lockMap.delete(entityName)
    editorRoom.send('editorUnlocked', { entityName })
    console.log(`[server] "${entityName}" unlocked`)
  })

  editorRoom.onMessage('editorCommit', (data, context) => {
    if (!context) return
    const addr = context.from
    if (!isAdmin(addr)) return

    const { entityName, px, py, pz, rx, ry, rz, rw, sx, sy, sz } = data
    if (lockMap.get(entityName) !== addr) return

    const entity = namedEntities.get(entityName)
    if (!entity || !Transform.has(entity)) return

    // Apply transform on server
    const t = Transform.getMutable(entity)
    t.position.x = px; t.position.y = py; t.position.z = pz
    t.rotation.x = rx; t.rotation.y = ry; t.rotation.z = rz; t.rotation.w = rw
    t.scale.x = sx; t.scale.y = sy; t.scale.z = sz

    // Persist
    persistence.save(entityName, {
      position: { x: px, y: py, z: pz },
      rotation: { x: rx, y: ry, z: rz, w: rw },
      scale: { x: sx, y: sy, z: sz },
    })

    // Broadcast to all clients
    editorRoom.send('editorConfirm', { entityName, px, py, pz, rx, ry, rz, rw, sx, sy, sz })
    console.log(`[server] "${entityName}" committed by ${addr.substring(0, 10)}...`)
  })

  editorRoom.onMessage('editorReset', (data, context) => {
    if (!context) return
    const addr = context.from
    if (!isAdmin(addr)) return

    const { entityName } = data
    const entity = namedEntities.get(entityName)
    if (!entity || !Transform.has(entity)) return

    const original = originalTransforms.get(entityName)
    if (original) {
      const t = Transform.getMutable(entity)
      const p = original.position, r = original.rotation, s = original.scale
      t.position.x = p.x; t.position.y = p.y; t.position.z = p.z
      t.rotation.x = r.x; t.rotation.y = r.y; t.rotation.z = r.z; t.rotation.w = r.w
      t.scale.x = s.x; t.scale.y = s.y; t.scale.z = s.z

      editorRoom.send('editorConfirm', {
        entityName,
        px: p.x, py: p.y, pz: p.z,
        rx: r.x, ry: r.y, rz: r.z, rw: r.w,
        sx: s.x, sy: s.y, sz: s.z,
      })
    }

    // Remove override
    persistence.save(entityName, undefined)

    const currentHolder = lockMap.get(entityName)
    if (currentHolder) {
      lockMap.delete(entityName)
      editorRoom.send('editorUnlocked', { entityName })
    }

    console.log(`[server] "${entityName}" reset by ${addr.substring(0, 10)}...`)
  })
}

// ── Server init ─────────────────────────────────────────

export async function startServer() {
  console.log('[server] starting...')

  await loadAdminList()

  // Pick persistence backend
  if (isPreview) {
    const realm = RealmInfo.getOrNull(engine.RootEntity)
    const preview = new PreviewBackend()
    if (realm?.baseUrl) {
      preview.connect(realm.baseUrl)
    }
    persistence = preview
  }

  // Discover all named entities (code-created + composite)
  discoverNamedEntities()

  // Capture original transforms before applying overrides
  captureOriginalTransforms()

  // Protect transforms on any entities the scene may have synced
  protectTransforms()

  // Load and apply saved overrides
  const overrides = await persistence.load()
  const overrideEntries = Object.entries(overrides)
  for (const [name, override] of overrideEntries) {
    applyOverride(name, override)
  }
  if (overrideEntries.length > 0) console.log(`[server] applied ${overrideEntries.length} saved override(s)`)

  // Register message handlers
  registerHandlers()

  // Track player disconnects for lock cleanup
  engine.addSystem(playerDisconnectSystem)

  console.log('[server] ready')
}
