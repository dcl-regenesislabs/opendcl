/**
 * Scene Editor — the single entry point.
 *
 * Usage:
 *   import { enableEditor } from './__editor'
 *   enableEditor()
 *
 * Handles server/client branching internally.
 * On server: syncs entities, manages locks, persists overrides.
 * On client: waits for admin auth, then shows editor UI + gizmos.
 */

import {
  engine,
  Entity,
  Name,
  Transform,
  MeshCollider,
  pointerEventsSystem,
  InputAction,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { isServer, isStateSyncronized } from '@dcl/sdk/network'
import { applyFlatTransform } from './math-utils'
import { state, editorEntities, gizmoClickConsumed, selectableInfoMap, setLock, clearLock, setToggleHandler } from './state'
import { setupEditorUi } from './ui'
import { createEditorCamera, createLockCamera, deactivateEditorCamera, editorCameraSystem } from './camera'
import { SKIP_ENTITIES, discoverySystem, removeAllPointerEvents, restoreAllPointerEvents } from './discovery'
import { deselectEntity } from './selection'
import { startDrag, startPlaneDrag, dragSystem } from './drag'
import { gizmoFollowSystem, setStartDragHandler, setStartPlaneDragHandler } from './gizmo'
import { modeToggleSystem, resetGizmoClickFlag } from './input'

import { editorRoom } from './messages'
import { startServer } from './server'

let initialized = false

export function enableEditor() {
  if (initialized) return
  initialized = true

  if (isServer()) {
    startServer()
    return
  }

  setupEditorUi()
  setupMessageListeners()
  engine.addSystem(pendingOverrideSystem)
  waitForRoomAndRequestAccess()
}

function handleToggle() {
  if (state.editorActive) {
    // Deactivate: deselect, disable editor camera, remove hover hints
    deselectEntity()
    if (state.editorCamActive) deactivateEditorCamera()
    removeAllPointerEvents()
    state.editorActive = false
    console.log('[editor] editor OFF')
  } else {
    state.editorActive = true
    restoreAllPointerEvents()
    console.log('[editor] editor ON')
  }
}

// ── Room readiness ──────────────────────────────────────

function waitForRoomAndRequestAccess() {
  let wasConnected = false
  let readySent = false
  const system = () => {
    const synced = isStateSyncronized()
    if (synced && !readySent) {
      readySent = true
      wasConnected = true
      console.log('[editor] room connected — requesting access')
      editorRoom.send('editorReady', {})
    } else if (synced && !wasConnected) {
      // Reconnected
      wasConnected = true
      state.connectionState = 'connected'
      console.log('[editor] reconnected')
      editorRoom.send('editorReady', {})
    } else if (!synced && wasConnected) {
      // Lost connection
      wasConnected = false
      state.connectionState = 'disconnected'
      console.log('[editor] disconnected')
    }
  }
  engine.addSystem(system)
}

// ── Message listeners (client only) ─────────────────────

function setupMessageListeners() {
  editorRoom.onMessage('editorEnable', (data) => {
    state.connectionState = 'connected'
    state.snapshotEnabled = data.snapshotEnabled ?? true
    state.snapshotCount = data.snapshotCount ?? 0
    if (data.admin) {
      state.myAddress = data.address
      state.isAdmin = true
      console.log(`[editor] admin access granted (${data.address.substring(0, 10)}...)`)
      setupClientEditor()
    } else {
      console.log('[editor] connected as viewer (not admin)')
    }
  })

  editorRoom.onMessage('editorSnapshotChanged', (data) => {
    state.snapshotEnabled = data.enabled
    state.snapshotCount = data.count
    console.log(`[editor] snapshot ${data.enabled ? 'enabled' : 'disabled'} (${data.count} entities)`)
  })

  editorRoom.onMessage('editorLocked', (data) => setLock(data.entityName, data.lockedBy))
  editorRoom.onMessage('editorUnlocked', (data) => clearLock(data.entityName))
  editorRoom.onMessage('editorConfirm', (data) => applyConfirmedTransform(data))

  editorRoom.onMessage('editorPreviousAvailable', (data) => {
    state.previousAvailable = true
    state.previousEntityCount = data.entityCount
    console.log(`[editor] previous layout available (${data.entityCount} entities)`)
  })

  editorRoom.onMessage('editorPreviousCleared', () => {
    state.previousAvailable = false
    state.previousEntityCount = 0
  })
}

interface PendingOverride {
  entityName: string
  px: number; py: number; pz: number
  rx: number; ry: number; rz: number; rw: number
  sx: number; sy: number; sz: number
}

/** Overrides received before entities exist — retried each frame. */
const pendingOverrides = new Map<string, PendingOverride>()

function applyConfirmedTransform(data: PendingOverride) {
  const entity = findEntityByName(data.entityName)
  if (!entity) {
    // Entity doesn't exist yet — queue for retry
    pendingOverrides.set(data.entityName, data)
    return
  }

  const t = Transform.getMutable(entity)
  applyFlatTransform(t, data)
  pendingOverrides.delete(data.entityName)
}

/** Per-frame system: retries pending overrides for entities that didn't exist yet. */
function pendingOverrideSystem() {
  if (pendingOverrides.size === 0) return
  for (const [name, data] of pendingOverrides) {
    const entity = findEntityByName(name)
    if (entity) {
      const t = Transform.getMutable(entity)
      applyFlatTransform(t, data)
      pendingOverrides.delete(name)
    }
  }
}

function findEntityByName(name: string): Entity | undefined {
  // Search all entities with Name, not just selectableInfoMap
  // (editorConfirm must work even when editor is toggled OFF)
  for (const [entity] of engine.getEntitiesWith(Name, Transform)) {
    if (Name.get(entity).value === name) return entity
  }
  return undefined
}

// ── Client editor setup ─────────────────────────────────

let editorStarted = false

function setupClientEditor() {
  if (editorStarted) return
  editorStarted = true

  SKIP_ENTITIES.add(engine.RootEntity)
  SKIP_ENTITIES.add(engine.CameraEntity)
  SKIP_ENTITIES.add(engine.PlayerEntity)

  setToggleHandler(handleToggle)
  createDeselectGround()
  setStartDragHandler(startDrag)
  setStartPlaneDragHandler(startPlaneDrag)
  createEditorCamera()
  createLockCamera()

  engine.addSystem(editorCameraSystem, 102)
  engine.addSystem(discoverySystem, 100)
  engine.addSystem(dragSystem)
  engine.addSystem(gizmoFollowSystem)
  engine.addSystem(modeToggleSystem)
  engine.addSystem(resetGizmoClickFlag, Number.MAX_SAFE_INTEGER)

  console.log('[editor] ready — click to select, E toggle Move/Rotate, F deselect')
}

function createDeselectGround() {
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(0, -0.05, 0),
    scale: Vector3.create(300, 0.1, 300),
  })
  MeshCollider.setBox(ground, ColliderLayer.CL_POINTER)
  editorEntities.add(ground)

  pointerEventsSystem.onPointerDown(
    { entity: ground, opts: { button: InputAction.IA_POINTER, maxDistance: 100, showFeedback: false } },
    () => {
      if (!state.editorActive || state.isDragging || gizmoClickConsumed) return
      deselectEntity()
    }
  )
}
