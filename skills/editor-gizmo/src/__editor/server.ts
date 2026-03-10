/**
 * Auth-server entry point.
 * Syncs scene entities, loads/saves overrides, manages locks, authorizes admins.
 */

import { engine, Entity, Transform, Name, PlayerIdentityData, RealmInfo, executeTask } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Storage, EnvVar } from '@dcl/sdk/server'
import { getSceneInformation } from '~system/Runtime'
import { editorRoom } from './messages'
import { copyVec3, copyQuat, applyFlatTransform } from './math-utils'

// ── Entity discovery ────────────────────────────────────
// Per-frame scan for entities with Name + Transform. Picks up
// late arrivals (e.g. GLTF child nodes that spawn after the parent).

const namedEntities = new Map<string, Entity>()

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

/** Loaded overrides kept in memory so late-arriving entities can be patched. */
let loadedOverrides: OverrideMap = {}

/** Whether overrides are currently applied to entities. */
let snapshotEnabled = true

/** Process a single newly discovered entity: capture original, protect, apply override. */
function onEntityDiscovered(name: string, entity: Entity) {
  if (!Transform.has(entity)) return

  // Capture the code-defined transform as the original
  const t = Transform.get(entity)
  originalTransforms.set(name, {
    position: { x: t.position.x, y: t.position.y, z: t.position.z },
    rotation: { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z, w: t.rotation.w },
    scale: { x: t.scale.x, y: t.scale.y, z: t.scale.z },
  })

  // Protect transform (server-only writes + lock holders)
  Transform.validateBeforeChange(entity, (value) => {
    if (value.senderAddress === AUTH_SERVER_PEER_ID) return true
    const lockHolder = lockMap.get(name)
    return lockHolder !== undefined && lockHolder === value.senderAddress
  })

  // Apply saved override if one exists and snapshot is enabled
  if (snapshotEnabled && loadedOverrides[name]) {
    applyOverride(name, loadedOverrides[name])
    console.log(`[server] applied override for late entity "${name}"`)
  }
}

/** Per-frame system: discovers new named entities as they appear. */
function entityDiscoverySystem() {
  if (!serverReady) return
  for (const [entity] of engine.getEntitiesWith(Name, Transform)) {
    const name = Name.get(entity).value
    if (name && !namedEntities.has(name)) {
      namedEntities.set(name, entity)
      onEntityDiscovered(name, entity)
    }
  }
}

// ── Storage keys ────────────────────────────────────────

const STORAGE_LATEST = 'editor:latest'
const STORAGE_PREVIOUS = 'editor:previous'

interface LatestData {
  sceneUrn: string
  overrides: OverrideMap
}

/** Whether a previous layout from a prior deploy is available. */
let hasPrevious = false

// ── Persistence backend ─────────────────────────────────

interface PersistenceBackend {
  load(): Promise<OverrideMap>
  /** Save a transform override. Pass undefined to remove (reset to code default). */
  save(entityName: string, transform: TransformData | undefined): Promise<void>
}

/** Deployed mode — uses editor:latest / editor:previous keys in Storage. */
class StorageBackend implements PersistenceBackend {
  private overrides: OverrideMap = {}
  private sceneUrn: string = ''
  private dirty = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly FLUSH_DELAY = 2000

  /** Initialize: detect deploy change, archive if needed, return current overrides. */
  async init(currentUrn: string): Promise<OverrideMap> {
    this.sceneUrn = currentUrn

    let latest: LatestData | null = null
    try { latest = await Storage.get<LatestData>(STORAGE_LATEST) } catch {}

    if (!latest) {
      // First ever run — check for legacy 'editor-overrides' key and migrate
      let legacyOverrides: OverrideMap = {}
      try {
        const legacy = await Storage.get<OverrideMap>('editor-overrides')
        if (legacy && Object.keys(legacy).length > 0) {
          legacyOverrides = legacy
          await Storage.delete('editor-overrides')
          console.log(`[server] migrated ${Object.keys(legacy).length} override(s) from legacy storage`)
        }
      } catch {}

      this.overrides = legacyOverrides
      await Storage.set(STORAGE_LATEST, { sceneUrn: currentUrn, overrides: legacyOverrides })
      // Check if there's a leftover previous from a prior install
      try {
        const prev = await Storage.get<LatestData>(STORAGE_PREVIOUS)
        hasPrevious = prev !== null && Object.keys(prev.overrides).length > 0
      } catch {}
      return legacyOverrides
    }

    if (latest.sceneUrn !== currentUrn) {
      // New deployment detected
      const hasContent = Object.keys(latest.overrides).length > 0
      if (hasContent) {
        // Archive latest → previous (overwrites any existing previous)
        await Storage.set(STORAGE_PREVIOUS, latest)
        hasPrevious = true
        console.log(`[server] new deploy — archived ${Object.keys(latest.overrides).length} override(s) as previous`)
      } else {
        // No edits since last deploy — check if previous already exists
        try {
          const prev = await Storage.get<LatestData>(STORAGE_PREVIOUS)
          hasPrevious = prev !== null && Object.keys(prev.overrides).length > 0
        } catch {}
      }

      // Fresh latest for new deploy
      this.overrides = {}
      await Storage.set(STORAGE_LATEST, { sceneUrn: currentUrn, overrides: {} })
      return {}
    }

    // Same deployment — load overrides
    this.overrides = latest.overrides
    // Check if previous exists
    try {
      const prev = await Storage.get<LatestData>(STORAGE_PREVIOUS)
      hasPrevious = prev !== null && Object.keys(prev.overrides).length > 0
    } catch {}
    return this.overrides
  }

  async load(): Promise<OverrideMap> {
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
    await Storage.set(STORAGE_LATEST, { sceneUrn: this.sceneUrn, overrides: this.overrides })
    console.log(`[server] flushed overrides to storage`)
  }

  /** Load previous layout overrides. Only returns entities that exist in the current scene. */
  async loadPrevious(): Promise<OverrideMap | null> {
    try {
      const prev = await Storage.get<LatestData>(STORAGE_PREVIOUS)
      if (!prev) return null
      // Filter to entities that exist in current scene
      const filtered: OverrideMap = {}
      for (const [name, data] of Object.entries(prev.overrides)) {
        if (namedEntities.has(name)) filtered[name] = data
      }
      return filtered
    } catch { return null }
  }

  /** Delete the previous layout. */
  async deletePrevious() {
    await Storage.delete(STORAGE_PREVIOUS)
    hasPrevious = false
  }

  /** Clear all current overrides. */
  async clearAll() {
    this.overrides = {}
    this.dirty = false
    await Storage.set(STORAGE_LATEST, { sceneUrn: this.sceneUrn, overrides: {} })
  }
}

async function getSceneUrn(): Promise<string> {
  try {
    const info = await getSceneInformation({})
    return info.urn
  } catch {
    console.log('[server] could not get scene URN — skipping deploy detection')
    return ''
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
    if (!transform) {
      // TODO: handle deletion — POST empty or DELETE
      return
    }

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

// ── Apply override to entity ────────────────────────────

function applyOverride(name: string, override: TransformData) {
  const entity = namedEntities.get(name)
  if (!entity || !Transform.has(entity)) return

  const t = Transform.getMutable(entity)
  copyVec3(t.position, override.position)
  copyQuat(t.rotation, override.rotation)
  copyVec3(t.scale, override.scale)
}

// ── Player tracking ─────────────────────────────────────

const connectedAdmins = new Set<string>()

function playerDisconnectSystem() {
  if (!serverReady) return

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

/** Send all current overrides to a player. */
function sendOverridesToPlayer(addr: string) {
  const count = Object.keys(loadedOverrides).length
  if (count === 0) return
  for (const [name, override] of Object.entries(loadedOverrides)) {
    editorRoom.send('editorConfirm', buildConfirmPayload(name, override), { to: [addr] })
  }
  console.log(`[server] sent ${count} override(s) to ${addr.substring(0, 10)}...`)
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

function buildConfirmPayload(entityName: string, td: TransformData) {
  const { position: p, rotation: r, scale: s } = td
  return {
    entityName,
    px: p.x, py: p.y, pz: p.z,
    rx: r.x, ry: r.y, rz: r.z, rw: r.w,
    sx: s.x, sy: s.y, sz: s.z,
  }
}

function broadcastUnlockAll() {
  for (const [entityName] of lockMap) {
    editorRoom.send('editorUnlocked', { entityName })
  }
  lockMap.clear()
}

// ── Server readiness + pending queue ────────────────────

let serverReady = false
const pendingReadyAddresses: string[] = []

function handleEditorReady(addr: string) {
  const admin = isAdmin(addr)
  const snapshotCount = Object.keys(loadedOverrides).length
  editorRoom.send('editorEnable', { admin, address: addr, snapshotEnabled, snapshotCount }, { to: [addr] })
  console.log(`[server] player ${addr.substring(0, 10)}... ready — admin: ${admin}, snapshot: ${snapshotEnabled}`)

  // Send overrides if snapshot is enabled
  if (snapshotEnabled) sendOverridesToPlayer(addr)

  if (admin) {
    connectedAdmins.add(addr)
    for (const [entityName, lockedBy] of lockMap) {
      editorRoom.send('editorLocked', { entityName, lockedBy }, { to: [addr] })
    }
    // Notify if previous layout is available (deployed mode only)
    if (hasPrevious && !isPreview && persistence instanceof StorageBackend) {
      const sb = persistence
      executeTask(async () => {
        const prev = await sb.loadPrevious()
        if (prev) {
          editorRoom.send('editorPreviousAvailable', { entityCount: Object.keys(prev).length }, { to: [addr] })
        }
      })
    }
  }
}

// ── Message handlers ────────────────────────────────────

function registerHandlers() {
  editorRoom.onMessage('editorReady', (_data, context) => {
    if (!context) return
    const addr = context.from
    if (!serverReady) {
      pendingReadyAddresses.push(addr)
      console.log(`[server] queuing editorReady from ${addr.substring(0, 10)}... (init pending)`)
      return
    }
    handleEditorReady(addr)
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
    if (!isAdmin(addr)) return
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
    applyFlatTransform(t, { px, py, pz, rx, ry, rz, rw, sx, sy, sz })

    // Persist + keep loadedOverrides in sync for new client connections
    const override = {
      position: { x: px, y: py, z: pz },
      rotation: { x: rx, y: ry, z: rz, w: rw },
      scale: { x: sx, y: sy, z: sz },
    }
    persistence.save(entityName, override)
    loadedOverrides[entityName] = override

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
      copyVec3(t.position, original.position)
      copyQuat(t.rotation, original.rotation)
      copyVec3(t.scale, original.scale)

      editorRoom.send('editorConfirm', buildConfirmPayload(entityName, original))
    }

    // Remove override
    persistence.save(entityName, undefined)
    delete loadedOverrides[entityName]

    const currentHolder = lockMap.get(entityName)
    if (currentHolder) {
      lockMap.delete(entityName)
      editorRoom.send('editorUnlocked', { entityName })
    }

    console.log(`[server] "${entityName}" reset by ${addr.substring(0, 10)}...`)
  })

  editorRoom.onMessage('editorResetAll', (_data, context) => {
    if (!context) return
    const addr = context.from
    if (!isAdmin(addr)) return

    // Reset all entities to code defaults
    for (const [name, entity] of namedEntities) {
      const original = originalTransforms.get(name)
      if (!original || !Transform.has(entity)) continue

      const t = Transform.getMutable(entity)
      copyVec3(t.position, original.position)
      copyQuat(t.rotation, original.rotation)
      copyVec3(t.scale, original.scale)

      editorRoom.send('editorConfirm', buildConfirmPayload(name, original))
    }

    broadcastUnlockAll()

    // Clear storage
    if (!isPreview && persistence instanceof StorageBackend) {
      const sb = persistence
      executeTask(async () => { await sb.clearAll() })
    }
    loadedOverrides = {}
    console.log(`[server] all entities reset by ${addr.substring(0, 10)}...`)
  })

  editorRoom.onMessage('editorLoadPrevious', (_data, context) => {
    if (!context) return
    const addr = context.from
    if (!isAdmin(addr) || isPreview || !(persistence instanceof StorageBackend)) return

    // Release all locks first — loading previous overwrites positions
    broadcastUnlockAll()

    const sb = persistence
    executeTask(async () => {
      const prev = await sb.loadPrevious()
      if (!prev) return

      // Apply previous overrides to entities
      for (const [name, override] of Object.entries(prev)) {
        applyOverride(name, override)
        editorRoom.send('editorConfirm', buildConfirmPayload(name, override))
      }

      // Save as current overrides
      loadedOverrides = prev
      for (const [name, override] of Object.entries(prev)) {
        await sb.save(name, override)
      }

      // Clean up previous
      await sb.deletePrevious()
      editorRoom.send('editorPreviousCleared', {})
      console.log(`[server] loaded ${Object.keys(prev).length} override(s) from previous layout`)
    })
  })

  editorRoom.onMessage('editorSetSnapshot', (data, context) => {
    if (!context) return
    const addr = context.from
    if (!isAdmin(addr)) return

    const enabled = !!data.enabled
    if (enabled === snapshotEnabled) return

    snapshotEnabled = enabled

    if (enabled) {
      // Re-apply all overrides
      for (const [name, override] of Object.entries(loadedOverrides)) {
        applyOverride(name, override)
        editorRoom.send('editorConfirm', buildConfirmPayload(name, override))
      }
    } else {
      // Revert all entities to code defaults
      for (const [name, entity] of namedEntities) {
        const original = originalTransforms.get(name)
        if (!original || !Transform.has(entity)) continue

        const t = Transform.getMutable(entity)
        copyVec3(t.position, original.position)
        copyQuat(t.rotation, original.rotation)
        copyVec3(t.scale, original.scale)

        editorRoom.send('editorConfirm', buildConfirmPayload(name, original))
      }
    }

    editorRoom.send('editorSnapshotChanged', { enabled, count: Object.keys(loadedOverrides).length })
    console.log(`[server] snapshot ${enabled ? 'enabled' : 'disabled'} by ${addr.substring(0, 10)}...`)
  })

  editorRoom.onMessage('editorDismissPrevious', (_data, context) => {
    if (!context) return
    const addr = context.from
    if (!isAdmin(addr) || isPreview || !(persistence instanceof StorageBackend)) return

    const sb = persistence
    executeTask(async () => {
      await sb.deletePrevious()
      editorRoom.send('editorPreviousCleared', {})
      console.log(`[server] previous layout dismissed by ${addr.substring(0, 10)}...`)
    })
  })
}

// ── Server init ─────────────────────────────────────────

export function startServer() {
  console.log('[server] starting...')

  // Register message handlers FIRST — clients may send editorReady
  // before async init finishes. Handlers check `serverReady` flag.
  registerHandlers()

  // Track player disconnects for lock cleanup
  engine.addSystem(playerDisconnectSystem)

  // Per-frame entity discovery (picks up late arrivals like GLTF child nodes)
  engine.addSystem(entityDiscoverySystem)

  // Do async init (admin list, persistence, overrides)
  executeTask(async () => {
    await loadAdminList()

    // Pick persistence backend
    if (isPreview) {
      // Preview: PreviewBackend → WebSocket/fetch → sdk-commands → editor-scene.json
      const realm = RealmInfo.getOrNull(engine.RootEntity)
      const preview = new PreviewBackend()
      if (realm?.baseUrl) preview.connect(realm.baseUrl)
      persistence = preview
      loadedOverrides = await preview.load()
    } else {
      // Deployed: StorageBackend → remote Storage service
      const storageBackend = new StorageBackend()
      const currentUrn = await getSceneUrn()
      loadedOverrides = await storageBackend.init(currentUrn)
      persistence = storageBackend
      if (hasPrevious) console.log('[server] previous layout available from prior deploy')
    }

    const count = Object.keys(loadedOverrides).length
    if (count > 0) console.log(`[server] loaded ${count} override(s)`)

    // Mark ready — discovery system starts running, pending editorReady messages are processed
    serverReady = true
    for (const pendingAddr of pendingReadyAddresses) {
      handleEditorReady(pendingAddr)
    }
    pendingReadyAddresses.length = 0

    console.log('[server] ready')
  })
}
