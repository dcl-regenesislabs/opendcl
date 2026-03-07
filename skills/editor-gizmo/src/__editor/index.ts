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
  Transform,
  MeshCollider,
  pointerEventsSystem,
  InputAction,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { isServer, isStateSyncronized } from '@dcl/sdk/network'
import { state, editorEntities, gizmoClickConsumed, selectableInfoMap, setLock, clearLock } from './state'
import { setupEditorUi } from './ui'
import { createEditorCamera, createLockCamera, editorCameraSystem } from './camera'
import { SKIP_ENTITIES, discoverySystem } from './discovery'
import { deselectEntity } from './selection'
import { startDrag, dragSystem } from './drag'
import { gizmoFollowSystem, setStartDragHandler } from './gizmo'
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

  setupMessageListeners()
  waitForRoomAndRequestAccess()
}

// ── Room readiness ──────────────────────────────────────

function waitForRoomAndRequestAccess() {
  const system = () => {
    if (!isStateSyncronized()) return
    engine.removeSystem(system)
    console.log('[editor] room connected — requesting access')
    editorRoom.send('editorReady', {})
  }
  engine.addSystem(system)
}

// ── Message listeners (client only) ─────────────────────

function setupMessageListeners() {
  editorRoom.onMessage('editorEnable', (data) => {
    if (data.admin) {
      state.myAddress = data.address
      console.log(`[editor] admin access granted (${data.address.substring(0, 10)}...)`)
      setupClientEditor()
    } else {
      console.log('[editor] connected as viewer (not admin)')
    }
  })

  editorRoom.onMessage('editorLocked', (data) => setLock(data.entityName, data.lockedBy))
  editorRoom.onMessage('editorUnlocked', (data) => clearLock(data.entityName))
  editorRoom.onMessage('editorConfirm', (data) => applyConfirmedTransform(data))
}

function applyConfirmedTransform(data: {
  entityName: string
  px: number; py: number; pz: number
  rx: number; ry: number; rz: number; rw: number
  sx: number; sy: number; sz: number
}) {
  const entity = findEntityByName(data.entityName)
  if (!entity || !Transform.has(entity)) return

  const t = Transform.getMutable(entity)
  t.position.x = data.px; t.position.y = data.py; t.position.z = data.pz
  t.rotation.x = data.rx; t.rotation.y = data.ry; t.rotation.z = data.rz; t.rotation.w = data.rw
  t.scale.x = data.sx; t.scale.y = data.sy; t.scale.z = data.sz
}

function findEntityByName(name: string): Entity | undefined {
  for (const [entity, info] of selectableInfoMap) {
    if (info.name === name) return entity
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

  createDeselectGround()
  setStartDragHandler(startDrag)
  createEditorCamera()
  createLockCamera()

  engine.addSystem(editorCameraSystem, 102)
  engine.addSystem(discoverySystem, 100)
  engine.addSystem(dragSystem)
  engine.addSystem(gizmoFollowSystem)
  engine.addSystem(modeToggleSystem)
  engine.addSystem(resetGizmoClickFlag, Number.MAX_SAFE_INTEGER)

  setupEditorUi()
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
      if (state.isDragging || gizmoClickConsumed) return
      deselectEntity()
    }
  )
}
