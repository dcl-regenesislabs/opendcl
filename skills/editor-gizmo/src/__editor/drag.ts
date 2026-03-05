/** Ray-plane intersection drag system for translate and rotate. */

import {
  engine,
  Transform,
  inputSystem,
  InputAction,
  PointerEventType,
  PrimaryPointerInfo,
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { Axis, state, handleAxisMap, handleDiscMap, handleArrowMap } from './state'
import { axisToVector, getDragPlaneNormal, rayPlaneIntersect, hitAngleOnPlane } from './math-utils'
import { getActiveCameraTransform, lockCamera, unlockCamera } from './camera'
import { getGizmoCenter, setArrowMaterial, setDiscMaterial } from './gizmo'
import { sendEntityUpdate } from './persistence'

export function startDrag(axis: Axis) {
  if (state.selectedEntity === undefined || !Transform.has(state.selectedEntity)) return

  const entityPos = Transform.get(state.selectedEntity).position
  const cameraT = getActiveCameraTransform()
  const cameraForward = Vector3.rotate(Vector3.Forward(), cameraT.rotation)

  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  if (!pointer || !pointer.worldRayDirection) return

  if (state.gizmoMode === 'translate') {
    const planeNormal = getDragPlaneNormal(axis, cameraForward)
    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, entityPos, planeNormal)
    if (!hit) return

    state.isDragging = true
    state.dragAxis = axis
    state.dragStartPos = Vector3.create(entityPos.x, entityPos.y, entityPos.z)
    state.dragStartHit = hit
    state.dragPlaneNormal = Vector3.create(planeNormal.x, planeNormal.y, planeNormal.z)
  } else {
    const center = getGizmoCenter(state.selectedEntity)
    const planeNormal = axisToVector(axis)
    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, center, planeNormal)
    if (!hit) return

    const entityRot = Transform.get(state.selectedEntity).rotation
    state.isDragging = true
    state.dragAxis = axis
    state.dragPlaneNormal = Vector3.create(planeNormal.x, planeNormal.y, planeNormal.z)
    state.dragRotCenter = Vector3.create(center.x, center.y, center.z)
    state.dragStartRot = Quaternion.create(entityRot.x, entityRot.y, entityRot.z, entityRot.w)
    state.dragStartAngle = hitAngleOnPlane(hit, center, axis)
  }

  lockCamera()
}

export function dragSystem(_dt: number) {
  if (!state.isDragging || state.selectedEntity === undefined || !Transform.has(state.selectedEntity))
    return

  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) { endDrag(); return }
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) { endDrag(); return }

  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  if (!pointer || !pointer.worldRayDirection) return
  const cameraT = getActiveCameraTransform()

  if (state.gizmoMode === 'translate') {
    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, state.dragStartPos, state.dragPlaneNormal)
    if (!hit) return

    const worldDelta = Vector3.subtract(hit, state.dragStartHit)
    const axisDir = axisToVector(state.dragAxis)
    const displacement = Vector3.dot(worldDelta, axisDir)

    const t = Transform.getMutable(state.selectedEntity)
    t.position.x = state.dragStartPos.x + (state.dragAxis === 'x' ? displacement : 0)
    t.position.y = state.dragStartPos.y + (state.dragAxis === 'y' ? displacement : 0)
    t.position.z = state.dragStartPos.z + (state.dragAxis === 'z' ? displacement : 0)
  } else {
    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, state.dragRotCenter, state.dragPlaneNormal)
    if (!hit) return

    const currentAngle = hitAngleOnPlane(hit, state.dragRotCenter, state.dragAxis)
    const degrees = (currentAngle - state.dragStartAngle) * (180 / Math.PI)
    const axisDir = axisToVector(state.dragAxis)
    const incrementalRot = Quaternion.fromAngleAxis(degrees, axisDir)
    const newRot = Quaternion.multiply(incrementalRot, state.dragStartRot)

    const t = Transform.getMutable(state.selectedEntity)
    t.rotation.x = newRot.x
    t.rotation.y = newRot.y
    t.rotation.z = newRot.z
    t.rotation.w = newRot.w
  }
}

function endDrag() {
  if (!state.isDragging) return
  state.isDragging = false
  unlockCamera()

  // Restore gizmo visuals
  if (state.gizmoMode === 'rotate') {
    for (const [h, d] of handleDiscMap) {
      const a = handleAxisMap.get(h)
      if (a) setDiscMaterial(d, a, false)
    }
  } else {
    for (const [h, parts] of handleArrowMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      for (const p of parts) setArrowMaterial(p, a, false)
    }
  }

  // Send update + log
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    sendEntityUpdate(state.selectedEntity)

    const t = Transform.get(state.selectedEntity)
    if (state.gizmoMode === 'translate') {
      console.log(`[editor] move ${state.dragAxis}: pos=(${t.position.x.toFixed(2)}, ${t.position.y.toFixed(2)}, ${t.position.z.toFixed(2)})`)
    } else {
      const euler = Quaternion.toEulerAngles(t.rotation)
      console.log(`[editor] rotate ${state.dragAxis}: rot=(${euler.x.toFixed(1)}, ${euler.y.toFixed(1)}, ${euler.z.toFixed(1)})`)
    }
  }
}
