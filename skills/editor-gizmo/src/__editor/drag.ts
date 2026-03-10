/** Ray-plane intersection drag system for translate and rotate. */

import {
  engine,
  Entity,
  Transform,
  inputSystem,
  InputAction,
  PointerEventType,
  PrimaryPointerInfo,
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { Axis, MAX_PARENT_DEPTH, state, selectableInfoMap, handleAxisMap, handleDiscMap, handleArrowMap } from './state'
import { axisToVector, getDragPlaneNormal, rayPlaneIntersect, hitAngleOnPlane, hitAngleOnWorldPlane, copyVec3, copyQuat, getOtherAxes } from './math-utils'
import { getActiveCameraTransform, lockCamera, unlockCamera } from './camera'
import { getGizmoCenter, getParentWorldRotation, setArrowMaterial, setRingMaterial } from './gizmo'
import { sendEntityUpdate } from './persistence'
import { captureTransform, pushHistory, TransformSnapshot } from './history'

/**
 * Convert a world-space displacement vector to local space,
 * accounting for parent rotation and cumulative scale chain.
 * Returns the local displacement vector to add to local position.
 */
function worldToLocalDelta(entity: Entity, worldDelta: Vector3): Vector3 {
  // Rotate world delta into local space using inverse parent rotation
  const parentRot = getParentWorldRotation(entity)
  const invParent = Quaternion.create(-parentRot.x, -parentRot.y, -parentRot.z, parentRot.w)
  let local = Vector3.rotate(worldDelta, invParent)

  // Walk up parent chain and accumulate scale per axis
  const info = selectableInfoMap.get(entity)
  let parentId = info?.parentEntity
  let depth = 0
  let sx = 1, sy = 1, sz = 1

  while (parentId && depth < MAX_PARENT_DEPTH) {
    const pe = parentId as Entity
    if (!Transform.has(pe)) break
    const pt = Transform.get(pe)
    sx *= pt.scale.x; sy *= pt.scale.y; sz *= pt.scale.z
    const parentInfo = selectableInfoMap.get(pe)
    parentId = parentInfo?.parentEntity
    depth++
  }

  return Vector3.create(
    sx !== 0 ? local.x / sx : local.x,
    sy !== 0 ? local.y / sy : local.y,
    sz !== 0 ? local.z / sz : local.z,
  )
}

let dragBeforeSnapshot: TransformSnapshot | undefined
/** World-space axis direction for single-axis translate drag (parent-rotated). */
let dragWorldAxis: Vector3 = Vector3.Right()
/** World-space rotation axis for rotate drag. */
let dragRotWorldAxis: Vector3 = Vector3.Up()
/** Parent world rotation at drag start (for converting world rot back to local). */
let dragParentWorldRot: { x: number; y: number; z: number; w: number } = Quaternion.Identity()
/** World-space local axes for plane drag (parent-rotated). */
let dragLocalAxes: { a1: Axis; d1: Vector3; a2: Axis; d2: Vector3 } = {
  a1: 'x', d1: Vector3.Right(), a2: 'z', d2: Vector3.Forward()
}

/**
 * Start a plane-constrained drag. normalAxis is the axis perpendicular to the plane:
 * - normalAxis 'y' → drag on XZ plane (horizontal movement)
 * - normalAxis 'z' → drag on XY plane
 * - normalAxis 'x' → drag on YZ plane
 */
export function startPlaneDrag(normalAxis: Axis) {
  if (state.selectedEntity === undefined || !Transform.has(state.selectedEntity)) return

  dragBeforeSnapshot = captureTransform(state.selectedEntity)

  const entityPos = Transform.get(state.selectedEntity).position
  const gizmoCenter = getGizmoCenter(state.selectedEntity)
  const cameraT = getActiveCameraTransform()

  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  if (!pointer || !pointer.worldRayDirection) return

  // World-aligned plane normal (gizmos are world-aligned)
  const worldNormal = axisToVector(normalAxis)

  const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, gizmoCenter, worldNormal)
  if (!hit) return

  // Determine the two world axes that lie in the plane
  const axes = getOtherAxes(normalAxis)
  dragLocalAxes = {
    a1: axes[0], d1: axisToVector(axes[0]),
    a2: axes[1], d2: axisToVector(axes[1]),
  }

  state.isDragging = true
  state.dragPlaneMode = normalAxis
  state.dragAxis = 'x' // unused, needs a value
  state.dragStartPos = Vector3.create(entityPos.x, entityPos.y, entityPos.z)
  state.dragStartWorldPos = Vector3.create(gizmoCenter.x, gizmoCenter.y, gizmoCenter.z)
  state.dragStartHit = hit
  state.dragPlaneNormal = Vector3.create(worldNormal.x, worldNormal.y, worldNormal.z)

  lockCamera()
}

export function startDrag(axis: Axis) {
  if (state.selectedEntity === undefined || !Transform.has(state.selectedEntity)) return

  // Capture transform before any changes for undo
  dragBeforeSnapshot = captureTransform(state.selectedEntity)

  const entityPos = Transform.get(state.selectedEntity).position
  const gizmoCenter = getGizmoCenter(state.selectedEntity)
  const cameraT = getActiveCameraTransform()
  const cameraForward = Vector3.rotate(Vector3.Forward(), cameraT.rotation)

  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  if (!pointer || !pointer.worldRayDirection) return

  if (state.gizmoMode === 'translate') {
    // World-aligned arrows: drag along world axes directly
    dragWorldAxis = axisToVector(axis)

    const planeNormal = getDragPlaneNormal(axis, cameraForward, dragWorldAxis)
    // Use world position (gizmoCenter) for plane intersection, but track local pos for delta
    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, gizmoCenter, planeNormal)
    if (!hit) return

    state.isDragging = true
    state.dragPlaneMode = undefined
    state.dragAxis = axis
    state.dragStartPos = Vector3.create(entityPos.x, entityPos.y, entityPos.z)
    state.dragStartWorldPos = Vector3.create(gizmoCenter.x, gizmoCenter.y, gizmoCenter.z)
    state.dragStartHit = hit
    state.dragPlaneNormal = Vector3.create(planeNormal.x, planeNormal.y, planeNormal.z)
  } else {
    const center = getGizmoCenter(state.selectedEntity)
    // World-aligned rotation: rings always point along world X, Y, Z
    const parentRot = getParentWorldRotation(state.selectedEntity)
    const worldAxis = axisToVector(axis)

    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, center, worldAxis)
    if (!hit) return

    dragRotWorldAxis = worldAxis
    dragParentWorldRot = Quaternion.create(parentRot.x, parentRot.y, parentRot.z, parentRot.w)

    state.isDragging = true
    state.dragAxis = axis
    state.dragPlaneNormal = Vector3.create(worldAxis.x, worldAxis.y, worldAxis.z)
    state.dragRotCenter = Vector3.create(center.x, center.y, center.z)
    const entRot = Transform.get(state.selectedEntity).rotation
    state.dragStartRot = Quaternion.create(entRot.x, entRot.y, entRot.z, entRot.w)
    state.dragStartAngle = hitAngleOnWorldPlane(hit, center, worldAxis)
  }

  lockCamera()
}

export function dragSystem(_dt: number) {
  if (!state.editorActive) return
  if (!state.isDragging || state.selectedEntity === undefined || !Transform.has(state.selectedEntity))
    return

  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) { endDrag(); return }
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) { endDrag(); return }

  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  if (!pointer || !pointer.worldRayDirection) return
  const cameraT = getActiveCameraTransform()

  if (state.gizmoMode === 'translate') {
    // Intersect on the world-space plane (using world position, not local)
    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, state.dragStartWorldPos, state.dragPlaneNormal)
    if (!hit) return

    const worldDelta = Vector3.subtract(hit, state.dragStartHit)

    let constrainedWorld: Vector3
    if (state.dragPlaneMode !== undefined) {
      // Plane drag: keep only the 2 world axes that lie in the plane
      const comp1 = Vector3.dot(worldDelta, dragLocalAxes.d1)
      const comp2 = Vector3.dot(worldDelta, dragLocalAxes.d2)
      constrainedWorld = Vector3.add(
        Vector3.scale(dragLocalAxes.d1, comp1),
        Vector3.scale(dragLocalAxes.d2, comp2),
      )
    } else {
      // Single axis: project onto world axis, convert to local
      const worldDisplacement = Vector3.dot(worldDelta, dragWorldAxis)
      constrainedWorld = Vector3.scale(dragWorldAxis, worldDisplacement)
    }

    const localDelta = worldToLocalDelta(state.selectedEntity, constrainedWorld)
    const t = Transform.getMutable(state.selectedEntity)
    t.position.x = state.dragStartPos.x + localDelta.x
    t.position.y = state.dragStartPos.y + localDelta.y
    t.position.z = state.dragStartPos.z + localDelta.z
  } else {
    const hit = rayPlaneIntersect(cameraT.position, pointer.worldRayDirection, state.dragRotCenter, state.dragPlaneNormal)
    if (!hit) return

    const currentAngle = hitAngleOnWorldPlane(hit, state.dragRotCenter, dragRotWorldAxis)
    const degrees = (currentAngle - state.dragStartAngle) * (180 / Math.PI)

    // Compute incremental rotation in world space, then convert to local
    const worldIncremental = Quaternion.fromAngleAxis(degrees, dragRotWorldAxis)
    // localIncremental = inv(parentWorldRot) * worldIncremental * parentWorldRot
    // For unit quaternions: inverse = conjugate (negate xyz, keep w)
    const ip = dragParentWorldRot
    const invParent = Quaternion.create(-ip.x, -ip.y, -ip.z, ip.w)
    const localIncremental = Quaternion.multiply(
      Quaternion.multiply(invParent, worldIncremental),
      dragParentWorldRot
    )
    const newRot = Quaternion.multiply(localIncremental, state.dragStartRot)

    const t = Transform.getMutable(state.selectedEntity)
    copyQuat(t.rotation, newRot)
  }
}

function endDrag() {
  if (!state.isDragging) return
  state.isDragging = false
  state.dragPlaneMode = undefined
  unlockCamera()

  // Restore gizmo visuals
  if (state.gizmoMode === 'rotate') {
    for (const [h] of handleDiscMap) {
      const a = handleAxisMap.get(h)
      if (a) setRingMaterial(h, a, false)
    }
  } else {
    for (const [h, parts] of handleArrowMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      for (const p of parts) setArrowMaterial(p, a, false)
    }
  }

  // Send update, push to history, log
  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const afterSnapshot = captureTransform(state.selectedEntity)

    if (dragBeforeSnapshot) {
      pushHistory(state.selectedEntity, dragBeforeSnapshot, afterSnapshot)
      dragBeforeSnapshot = undefined
    }

    sendEntityUpdate(state.selectedEntity)

    const t = Transform.get(state.selectedEntity)
    if (state.gizmoMode === 'translate') {
      const label = state.dragPlaneMode !== undefined ? `plane(${state.dragPlaneMode})` : state.dragAxis
      console.log(`[editor] move ${label}: pos=(${t.position.x.toFixed(2)}, ${t.position.y.toFixed(2)}, ${t.position.z.toFixed(2)})`)
    } else {
      const euler = Quaternion.toEulerAngles(t.rotation)
      console.log(`[editor] rotate ${state.dragAxis}: rot=(${euler.x.toFixed(1)}, ${euler.y.toFixed(1)}, ${euler.z.toFixed(1)})`)
    }
  }
}
