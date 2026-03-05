/** Key bindings, mode toggle, gizmo click flag. */

import { inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { state, gizmoClickConsumed, setGizmoClickConsumed } from './state'
import { createGizmo } from './gizmo'
import { deselectEntity } from './selection'
import { toggleEditorCamera, deactivateEditorCamera, focusSelectedEntity } from './camera'

export function modeToggleSystem() {
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    if (state.isDragging) return
    state.gizmoMode = state.gizmoMode === 'translate' ? 'rotate' : 'translate'
    console.log(`[editor] mode: ${state.gizmoMode}`)
    if (state.selectedEntity !== undefined) createGizmo()
  }

  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    if (state.isDragging) return
    if (state.editorCamActive && state.selectedEntity !== undefined) {
      focusSelectedEntity()
    } else if (state.selectedEntity !== undefined) {
      deselectEntity()
    } else if (state.editorCamActive) {
      deactivateEditorCamera()
    }
  }

  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
    toggleEditorCamera()
  }
}

export function resetGizmoClickFlag() {
  if (gizmoClickConsumed) setGizmoClickConsumed(false)
}
