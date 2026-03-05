/**
 * Scene Editor — auto-discovers entities and adds translate/rotate gizmos.
 *
 * Usage: import { enableEditor } from './__editor'
 *        Call enableEditor() at the end of your main() function.
 */

import {
  engine,
  Transform,
  MeshCollider,
  pointerEventsSystem,
  InputAction,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import { state, editorEntities, gizmoClickConsumed } from './state'
import { setupEditorUi } from './ui'
import { createEditorCamera, createLockCamera, editorCameraSystem } from './camera'
import { SKIP_ENTITIES, discoverySystem } from './discovery'
import { deselectEntity } from './selection'
import { startDrag, dragSystem } from './drag'
import { gizmoFollowSystem, setStartDragHandler } from './gizmo'
import { modeToggleSystem, resetGizmoClickFlag } from './input'
import { loadEditorOverrides, connectEditorWs } from './persistence'

// ============================================================
// enableEditor() — the single entry point
// ============================================================

let editorEnabled = false

export function enableEditor() {
  if (editorEnabled) return
  if (isServer()) return
  editorEnabled = true

  // Skip built-in entities
  SKIP_ENTITIES.add(engine.RootEntity)
  SKIP_ENTITIES.add(engine.CameraEntity)
  SKIP_ENTITIES.add(engine.PlayerEntity)

  // Invisible ground plane for deselect-on-click
  const deselectGround = engine.addEntity()
  Transform.create(deselectGround, {
    position: Vector3.create(0, -0.05, 0),
    scale: Vector3.create(300, 0.1, 300),
  })
  MeshCollider.setBox(deselectGround, ColliderLayer.CL_POINTER)
  editorEntities.add(deselectGround)

  pointerEventsSystem.onPointerDown(
    { entity: deselectGround, opts: { button: InputAction.IA_POINTER, maxDistance: 100, showFeedback: false } },
    () => {
      if (state.isDragging || gizmoClickConsumed) return
      deselectEntity()
    }
  )

  // Wire cross-module dependencies
  setStartDragHandler(startDrag)

  // Create camera entities
  createEditorCamera()
  createLockCamera()

  // Register all systems
  engine.addSystem(editorCameraSystem, 102)
  engine.addSystem(discoverySystem, 100)
  engine.addSystem(dragSystem)
  engine.addSystem(gizmoFollowSystem)
  engine.addSystem(modeToggleSystem)
  engine.addSystem(resetGizmoClickFlag, Number.MAX_SAFE_INTEGER)

  // Load overrides from server + connect WS
  loadEditorOverrides()
  connectEditorWs()

  setupEditorUi()
  console.log('[editor] enabled — click objects to select, E to toggle Move/Rotate, F to deselect')
}
