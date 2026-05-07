/**
 * Scene Editor — the single entry point.
 *
 * Usage:
 *   import { enableEditor } from './__editor'
 *   enableEditor()
 *
 * Pure client-side editor. On preview, lets the user toggle the editor on,
 * select entities declared in main-entities.ts, drag them around, and persist
 * changes to the preview server (which writes main-entities.ts on disk).
 *
 * Only available in preview — deployed scenes never show editor UI.
 */

import {
  engine,
  Transform,
  MeshCollider,
  pointerEventsSystem,
  InputAction,
  ColliderLayer,
  RealmInfo,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { state, editorEntities, gizmoClickConsumed, setToggleHandler } from './state'
import { setupEditorUi } from './ui'
import { createEditorCamera, createLockCamera, deactivateEditorCamera, editorCameraSystem } from './camera'
import { SKIP_ENTITIES, discoverySystem, removeAllPointerEvents, restoreAllPointerEvents } from './discovery'
import { deselectEntity } from './selection'
import { startDrag, startPlaneDrag, dragSystem } from './drag'
import { gizmoFollowSystem, setStartDragHandler, setStartPlaneDragHandler } from './gizmo'
import { modeToggleSystem, resetGizmoClickFlag } from './input'
import { initPersistence } from './persistence'

let initialized = false

export function enableEditor() {
  if (initialized) return
  initialized = true

  // Assume preview until RealmInfo says otherwise. RealmInfo isn't populated
  // synchronously at scene start, so we'd lock ourselves out if we read it
  // here and got null. Watch it instead and flip to false if deployed.
  state.isPreview = true
  const watchRealm = () => {
    const realm = RealmInfo.getOrNull(engine.RootEntity)
    if (!realm) return
    state.isPreview = realm.isPreview || realm.realmName?.includes('Preview')
    if (!state.isPreview) console.log('[editor] deployed scene — editor UI hidden')
    engine.removeSystem(watchRealm)
  }
  engine.addSystem(watchRealm)

  setupEditorUi()
  setupClientEditor()
  initPersistence()
}

function handleToggle() {
  if (state.editorActive) {
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

function setupClientEditor() {
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
