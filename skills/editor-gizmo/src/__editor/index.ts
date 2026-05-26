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
import { SKIP_ENTITIES, discoverySystem, editorClickSystem, removeAllPointerEvents, restoreAllPointerEvents } from './discovery'
import { deselectEntity } from './selection'
import { startDrag, startPlaneDrag, dragSystem } from './drag'
import { gizmoFollowSystem, setStartDragHandler, setStartPlaneDragHandler } from './gizmo'
import { modeToggleSystem, resetGizmoClickFlag } from './input'
import { initPersistence } from './persistence'

let initialized = false

export function enableEditor() {
  if (initialized) return
  initialized = true

  // UI + systems wire up immediately; visibility is gated on `state.isPreview`
  // which starts false. A one-shot polling system flips it true once
  // RealmInfo is published and the realm looks editable.
  setupEditorUi()
  setupClientEditor()
  initPersistence()
  engine.addSystem(realmDetectSystem)
}

/**
 * RealmInfo isn't populated synchronously at scene-module-load — the runtime
 * publishes it a few ticks in. Poll until it's available, then decide:
 *
 *   - deployed world (baseUrl on worlds-content-server) → never editable,
 *     even if some future SDK build flips `isPreview` true there.
 *   - `isPreview === true` → CLI `sdk-commands start` preview → editable.
 *   - studio realm (`/scenes/<id>/snapshots/<id>` in baseUrl) → editable.
 *     opendcl-studio doesn't set isPreview=true even though scenes there are
 *     editable; the path pattern is unique to studio's realm handler.
 *   - anything else (Genesis City, custom catalysts, etc.) → leave isPreview
 *     false so the toolbar/toggle never renders.
 *
 * Removes itself after the first decision — no need to keep polling.
 */
function realmDetectSystem(_dt: number) {
  const info = RealmInfo.getOrNull(engine.RootEntity)
  if (!info) return
  engine.removeSystem(realmDetectSystem)
  const baseUrl = info.baseUrl ?? ''
  if (baseUrl.startsWith('https://worlds-content-server.decentraland.org/')) {
    console.log('[editor] disabled: deployed world')
    return
  }
  if (info.isPreview) {
    state.isPreview = true
    return
  }
  if (/\/scenes\/[^/]+\/snapshots\/[^/]+/.test(baseUrl)) {
    state.isPreview = true
    return
  }
  console.log('[editor] disabled: not a preview/studio realm')
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
  engine.addSystem(editorClickSystem, 99)
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
