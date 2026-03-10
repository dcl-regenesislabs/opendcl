/** Gizmo creation — translate arrows and rotate discs. */

import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  MaterialTransparencyMode,
  pointerEventsSystem,
  InputAction,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import {
  Axis,
  MAX_PARENT_DEPTH,
  state,
  editorEntities,
  selectableInfoMap,
  gizmoEntities,
  gizmoRoot,
  setGizmoRoot,
  handleAxisMap,
  handleDiscMap,
  handleArrowMap,
  setGizmoClickConsumed,
} from './state'
import { copyVec3, copyQuat, getOtherAxes } from './math-utils'
import { getActiveCameraTransform } from './camera'
// startDrag/startPlaneDrag injected to avoid circular dependency with drag.ts
let _startDrag: ((axis: Axis) => void) | undefined
let _startPlaneDrag: ((normalAxis: Axis) => void) | undefined
export function setStartDragHandler(fn: (axis: Axis) => void) { _startDrag = fn }
export function setStartPlaneDragHandler(fn: (normalAxis: Axis) => void) { _startPlaneDrag = fn }

// ---- Constants ----

const SHAFT_LENGTH = 1.2
const SHAFT_RADIUS = 0.04
const TIP_LENGTH = 0.3
const TIP_RADIUS = 0.12
const HANDLE_RADIUS = 0.18

const RING_RADIUS = 1.0
const RING_THICKNESS = 0.05
const RING_COLLIDER_THICKNESS = 0.2

// Gizmo scales with camera distance — this factor controls apparent size
// At 10m distance, gizmo scale = 10 * 0.12 = 1.2 (roughly 1.5m arrows)
const GIZMO_SCALE_FACTOR = 0.12
const GIZMO_MIN_SCALE = 0.8
const GIZMO_MAX_SCALE = 5.0

const AXIS_COLORS: Record<Axis, { c4: Color4; c3: Color3 }> = {
  x: { c4: Color4.create(0.95, 0.15, 0.15, 1), c3: Color3.create(0.95, 0.15, 0.15) },
  y: { c4: Color4.create(0.2, 0.9, 0.2, 1), c3: Color3.create(0.2, 0.9, 0.2) },
  z: { c4: Color4.create(0.2, 0.3, 0.95, 1), c3: Color3.create(0.2, 0.3, 0.95) },
}

const AXIS_ROTATION: Record<Axis, { x: number; y: number; z: number; w: number }> = {
  x: Quaternion.fromEulerDegrees(0, 0, -90),
  y: Quaternion.Identity(),
  z: Quaternion.fromEulerDegrees(90, 0, 0),
}

const ARROW_EMISSIVE_DEFAULT = 0.6
const ARROW_EMISSIVE_HOVER = 2.5
const DISC_ALPHA_DEFAULT = 0.2
const DISC_ALPHA_HOVER = 0.6
const DISC_EMISSIVE_DEFAULT = 0.4
const DISC_EMISSIVE_HOVER = 1.5

// ---- Public ----

/** Compute cumulative world rotation of an entity's parent chain.
 *  For root entities (no parent), returns identity. */
export function getParentWorldRotation(entity: Entity): { x: number; y: number; z: number; w: number } {
  let worldRot = Quaternion.Identity()
  const info = selectableInfoMap.get(entity)
  let parentId = info?.parentEntity
  let depth = 0

  // Collect parent rotations bottom-up, then multiply top-down
  const rotations: { x: number; y: number; z: number; w: number }[] = []
  while (parentId && depth < MAX_PARENT_DEPTH) {
    const pe = parentId as Entity
    if (!Transform.has(pe)) break
    rotations.push(Transform.get(pe).rotation)
    const parentInfo = selectableInfoMap.get(pe)
    parentId = parentInfo?.parentEntity
    depth++
  }

  // Multiply top-down: grandparent * parent * ...
  for (let i = rotations.length - 1; i >= 0; i--) {
    worldRot = Quaternion.multiply(worldRot, rotations[i])
  }

  return worldRot
}

/** Compute world position of an entity by walking up the parent chain.
 *  Accounts for parent scale: childWorldPos = parentPos + parentRot * (parentScale * childLocalPos) */
function getWorldPosition(entity: Entity): Vector3 {
  const t = Transform.get(entity)
  let worldPos = Vector3.create(t.position.x, t.position.y, t.position.z)

  const info = selectableInfoMap.get(entity)
  let parentId = info?.parentEntity
  let depth = 0

  while (parentId && depth < MAX_PARENT_DEPTH) {
    const pe = parentId as Entity
    if (!Transform.has(pe)) break
    const pt = Transform.get(pe)
    // Scale the position by parent's scale, then rotate, then translate
    const scaled = Vector3.create(
      worldPos.x * pt.scale.x,
      worldPos.y * pt.scale.y,
      worldPos.z * pt.scale.z,
    )
    worldPos = Vector3.add(pt.position, Vector3.rotate(scaled, pt.rotation))
    const parentInfo = selectableInfoMap.get(pe)
    parentId = parentInfo?.parentEntity
    depth++
  }

  return worldPos
}

export function getGizmoCenter(entity: Entity): Vector3 {
  const worldPos = getWorldPosition(entity)
  const info = selectableInfoMap.get(entity)
  const offset = info?.centerOffset ?? Vector3.Zero()
  return Vector3.create(worldPos.x + offset.x, worldPos.y + offset.y, worldPos.z + offset.z)
}

export function createGizmo() {
  destroyGizmo()
  if (state.selectedEntity === undefined) return

  const center = getGizmoCenter(state.selectedEntity)
  const root = engine.addEntity()
  Transform.create(root, { position: center })
  gizmoEntities.push(root)
  editorEntities.add(root)
  setGizmoRoot(root)

  if (state.gizmoMode === 'translate') {
    createArrow('x', root)
    createArrow('y', root)
    createArrow('z', root)
    // Plane handles between each pair of axes
    createPlaneHandle('y', root) // XZ plane (horizontal)
    createPlaneHandle('z', root) // XY plane
    createPlaneHandle('x', root) // YZ plane
  } else {
    createRotationHandle('x', root)
    createRotationHandle('y', root)
    createRotationHandle('z', root)
  }
}

export function destroyGizmo() {
  for (const e of gizmoEntities) {
    if (handleAxisMap.has(e) || planeHandleMap.has(e)) {
      pointerEventsSystem.removeOnPointerDown(e)
      pointerEventsSystem.removeOnPointerHoverEnter(e)
      pointerEventsSystem.removeOnPointerHoverLeave(e)
      handleDiscMap.delete(e)
      handleArrowMap.delete(e)
      handleAxisMap.delete(e)
      planeHandleMap.delete(e)
      ringSegmentsMap.delete(e)
    }
    editorEntities.delete(e)
    engine.removeEntity(e)
  }
  gizmoEntities.length = 0
  setGizmoRoot(undefined)
}

export function gizmoFollowSystem() {
  if (gizmoRoot === undefined || state.selectedEntity === undefined) return
  if (!Transform.has(state.selectedEntity)) return

  const entityT = Transform.get(state.selectedEntity)
  const g = Transform.getMutable(gizmoRoot)

  const center = getGizmoCenter(state.selectedEntity)
  copyVec3(g.position, center)

  // Gizmo always world-aligned (both translate arrows and rotate rings)
  g.rotation.x = 0; g.rotation.y = 0; g.rotation.z = 0; g.rotation.w = 1

  // Scale gizmo: max of camera-distance-based and entity-size-based
  // 1) Camera distance → constant screen size
  const camT = getActiveCameraTransform()
  const dx = camT.position.x - center.x
  const dy = camT.position.y - center.y
  const dz = camT.position.z - center.z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const distScale = dist * GIZMO_SCALE_FACTOR

  // 2) Entity size → arrows must extend beyond the mesh
  const sc = entityT.scale
  const maxDim = Math.max(Math.abs(sc.x), Math.abs(sc.y), Math.abs(sc.z))
  // Arrow total length is ~1.5 units at scale 1, we want arrows to extend ~50% beyond the mesh radius
  // meshRadius ≈ maxDim * 0.5 (for primitives), arrow reaches gizmoScale * 1.5
  // gizmoScale * 1.5 > maxDim * 0.5 * 1.5 → gizmoScale > maxDim * 0.5
  const sizeScale = maxDim * 0.55

  const s = Math.min(GIZMO_MAX_SCALE, Math.max(GIZMO_MIN_SCALE, distScale, sizeScale))
  g.scale.x = s
  g.scale.y = s
  g.scale.z = s
}

// ---- Translate arrows ----

export function setArrowMaterial(entity: Entity, axis: Axis, hovered: boolean) {
  const { c4, c3 } = AXIS_COLORS[axis]
  Material.setPbrMaterial(entity, {
    albedoColor: c4,
    emissiveColor: c3,
    emissiveIntensity: hovered ? ARROW_EMISSIVE_HOVER : ARROW_EMISSIVE_DEFAULT,
    metallic: 0.7,
    roughness: 0.25,
  })
}

function createArrow(axis: Axis, root: Entity) {
  const rot = AXIS_ROTATION[axis]

  const container = engine.addEntity()
  Transform.create(container, { position: Vector3.Zero(), rotation: rot, parent: root })
  gizmoEntities.push(container)
  editorEntities.add(container)

  const shaft = engine.addEntity()
  Transform.create(shaft, {
    position: Vector3.create(0, SHAFT_LENGTH / 2, 0),
    scale: Vector3.create(1, SHAFT_LENGTH, 1),
    parent: container,
  })
  MeshRenderer.setCylinder(shaft, SHAFT_RADIUS, SHAFT_RADIUS)
  setArrowMaterial(shaft, axis, false)
  gizmoEntities.push(shaft)
  editorEntities.add(shaft)

  const tip = engine.addEntity()
  Transform.create(tip, {
    position: Vector3.create(0, SHAFT_LENGTH + TIP_LENGTH / 2, 0),
    scale: Vector3.create(1, TIP_LENGTH, 1),
    parent: container,
  })
  MeshRenderer.setCylinder(tip, TIP_RADIUS, 0)
  setArrowMaterial(tip, axis, false)
  gizmoEntities.push(tip)
  editorEntities.add(tip)

  const handle = engine.addEntity()
  Transform.create(handle, {
    position: Vector3.create(0, (SHAFT_LENGTH + TIP_LENGTH) / 2, 0),
    scale: Vector3.create(1, SHAFT_LENGTH + TIP_LENGTH, 1),
    parent: container,
  })
  MeshCollider.setCylinder(handle, HANDLE_RADIUS, HANDLE_RADIUS, ColliderLayer.CL_POINTER)
  gizmoEntities.push(handle)
  editorEntities.add(handle)

  handleAxisMap.set(handle, axis)
  handleArrowMap.set(handle, [shaft, tip])

  pointerEventsSystem.onPointerDown(
    { entity: handle, opts: { button: InputAction.IA_POINTER, hoverText: `Move ${axis.toUpperCase()}`, maxDistance: 100 } },
    () => { setGizmoClickConsumed(true); _startDrag?.(axis) }
  )

  pointerEventsSystem.onPointerHoverEnter({ entity: handle, opts: { maxDistance: 100 } }, () => {
    for (const [h, parts] of handleArrowMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      for (const p of parts) setArrowMaterial(p, a, h === handle)
    }
  })

  pointerEventsSystem.onPointerHoverLeave({ entity: handle, opts: { maxDistance: 100 } }, () => {
    if (state.isDragging && state.dragAxis === axis) return
    for (const [h, parts] of handleArrowMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      for (const p of parts) setArrowMaterial(p, a, false)
    }
  })
}

// ---- Plane handles (two-axis drag) ----

// Offset from center along each axis (fraction of shaft length)
const PLANE_OFFSET = 0.4
const PLANE_SIZE = 0.3
const PLANE_ALPHA = 0.55
const PLANE_ALPHA_HOVER = 0.8
const PLANE_EMISSIVE = 1.2
const PLANE_EMISSIVE_HOVER = 2.5

/** Map from plane handle entity → its visual entity + normal axis */
const planeHandleMap = new Map<Entity, { visual: Entity; normalAxis: Axis }>()

/** Get blended color for a plane from the two axes it spans. */
function planeColor(normalAxis: Axis): { c4: Color4; c3: Color3 } {
  // The plane's color is a mix of the two axes it contains
  const axes = getOtherAxes(normalAxis)
  const a = AXIS_COLORS[axes[0]]
  const b = AXIS_COLORS[axes[1]]
  return {
    c4: Color4.create((a.c4.r + b.c4.r) * 0.5, (a.c4.g + b.c4.g) * 0.5, (a.c4.b + b.c4.b) * 0.5, 1),
    c3: Color3.create((a.c3.r + b.c3.r) * 0.5, (a.c3.g + b.c3.g) * 0.5, (a.c3.b + b.c3.b) * 0.5),
  }
}

function setPlaneMaterial(visual: Entity, normalAxis: Axis, hovered: boolean) {
  const { c4, c3 } = planeColor(normalAxis)
  Material.setPbrMaterial(visual, {
    albedoColor: Color4.create(c4.r, c4.g, c4.b, hovered ? PLANE_ALPHA_HOVER : PLANE_ALPHA),
    emissiveColor: c3,
    emissiveIntensity: hovered ? PLANE_EMISSIVE_HOVER : PLANE_EMISSIVE,
    metallic: 0.5,
    roughness: 0.3,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  })
}

/**
 * Create a plane handle. normalAxis = axis perpendicular to the plane.
 * e.g. normalAxis='y' → XZ plane handle, positioned between X and Z arrows.
 */
function createPlaneHandle(normalAxis: Axis, root: Entity) {
  // Position: offset along the two in-plane axes
  const axes = getOtherAxes(normalAxis)
  const pos = Vector3.create(
    axes.includes('x') ? PLANE_OFFSET : 0,
    axes.includes('y') ? PLANE_OFFSET : 0,
    axes.includes('z') ? PLANE_OFFSET : 0,
  )

  // Visual: flat box aligned to the plane
  const visual = engine.addEntity()
  const scale = Vector3.create(
    normalAxis === 'x' ? 0.02 : PLANE_SIZE,
    normalAxis === 'y' ? 0.02 : PLANE_SIZE,
    normalAxis === 'z' ? 0.02 : PLANE_SIZE,
  )
  Transform.create(visual, { position: pos, scale, parent: root })
  MeshRenderer.setBox(visual)
  setPlaneMaterial(visual, normalAxis, false)
  gizmoEntities.push(visual)
  editorEntities.add(visual)

  // Collider: slightly larger for easier clicking
  const handle = engine.addEntity()
  const colliderScale = Vector3.create(
    normalAxis === 'x' ? 0.08 : PLANE_SIZE * 1.4,
    normalAxis === 'y' ? 0.08 : PLANE_SIZE * 1.4,
    normalAxis === 'z' ? 0.08 : PLANE_SIZE * 1.4,
  )
  Transform.create(handle, { position: pos, scale: colliderScale, parent: root })
  MeshCollider.setBox(handle, ColliderLayer.CL_POINTER)
  gizmoEntities.push(handle)
  editorEntities.add(handle)

  // Label: show which plane
  const planeLabel = axes.map(a => a.toUpperCase()).join('')
  planeHandleMap.set(handle, { visual, normalAxis })

  pointerEventsSystem.onPointerDown(
    { entity: handle, opts: { button: InputAction.IA_POINTER, hoverText: `Move ${planeLabel}`, maxDistance: 100 } },
    () => { setGizmoClickConsumed(true); _startPlaneDrag?.(normalAxis) }
  )

  pointerEventsSystem.onPointerHoverEnter({ entity: handle, opts: { maxDistance: 100 } }, () => {
    setPlaneMaterial(visual, normalAxis, true)
  })

  pointerEventsSystem.onPointerHoverLeave({ entity: handle, opts: { maxDistance: 100 } }, () => {
    if (state.isDragging && state.dragPlaneMode === normalAxis) return
    setPlaneMaterial(visual, normalAxis, false)
  })
}

// ---- Rotation rings ----

const RING_SEGMENTS = 24
const RING_SEGMENT_THICKNESS = 0.025
const RING_ALPHA_DEFAULT = 0.85
const RING_ALPHA_HOVER = 1.0
const RING_EMISSIVE_DEFAULT = 1.0
const RING_EMISSIVE_HOVER = 3.0

/** Map from handle entity → array of segment visual entities */
const ringSegmentsMap = new Map<Entity, Entity[]>()

export function setDiscMaterial(segmentOrDisc: Entity, axis: Axis, hovered: boolean) {
  const { c4, c3 } = AXIS_COLORS[axis]
  Material.setPbrMaterial(segmentOrDisc, {
    albedoColor: Color4.create(c4.r, c4.g, c4.b, hovered ? RING_ALPHA_HOVER : RING_ALPHA_DEFAULT),
    emissiveColor: c3,
    emissiveIntensity: hovered ? RING_EMISSIVE_HOVER : RING_EMISSIVE_DEFAULT,
    metallic: 0.7,
    roughness: 0.2,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  })
}

export function setRingMaterial(handle: Entity, axis: Axis, hovered: boolean) {
  const segments = ringSegmentsMap.get(handle)
  if (segments) {
    for (const seg of segments) setDiscMaterial(seg, axis, hovered)
  }
}

function createRotationHandle(axis: Axis, root: Entity) {
  const rot = AXIS_ROTATION[axis]

  const container = engine.addEntity()
  Transform.create(container, { position: Vector3.Zero(), rotation: rot, parent: root })
  gizmoEntities.push(container)
  editorEntities.add(container)

  // Build ring from segments (thin boxes placed around a circle in the XZ plane)
  const segAngle = (Math.PI * 2) / RING_SEGMENTS
  const segLength = RING_RADIUS * 2 * Math.sin(segAngle / 2) * 1.05 // slight overlap
  const segments: Entity[] = []

  for (let i = 0; i < RING_SEGMENTS; i++) {
    const angle = i * segAngle
    const x = Math.cos(angle) * RING_RADIUS
    const z = Math.sin(angle) * RING_RADIUS
    // Tangent direction for rotation
    const tangentAngle = angle + Math.PI / 2

    const seg = engine.addEntity()
    Transform.create(seg, {
      position: Vector3.create(x, 0, z),
      rotation: Quaternion.fromEulerDegrees(0, -tangentAngle * (180 / Math.PI), 0),
      scale: Vector3.create(segLength, RING_SEGMENT_THICKNESS, RING_SEGMENT_THICKNESS),
      parent: container,
    })
    MeshRenderer.setBox(seg)
    setDiscMaterial(seg, axis, false)
    gizmoEntities.push(seg)
    editorEntities.add(seg)
    segments.push(seg)
  }

  // Invisible collider cylinder for clicking (same as before)
  const handle = engine.addEntity()
  Transform.create(handle, {
    position: Vector3.Zero(),
    scale: Vector3.create(RING_RADIUS * 2, RING_COLLIDER_THICKNESS, RING_RADIUS * 2),
    parent: container,
  })
  MeshCollider.setCylinder(handle, 0.5, 0.5, ColliderLayer.CL_POINTER)
  gizmoEntities.push(handle)
  editorEntities.add(handle)

  handleAxisMap.set(handle, axis)
  ringSegmentsMap.set(handle, segments)
  // Keep handleDiscMap working by pointing to the first segment (for endDrag reset)
  handleDiscMap.set(handle, handle)

  pointerEventsSystem.onPointerDown(
    { entity: handle, opts: { button: InputAction.IA_POINTER, hoverText: `Rotate ${axis.toUpperCase()}`, maxDistance: 100 } },
    () => { setGizmoClickConsumed(true); _startDrag?.(axis) }
  )

  pointerEventsSystem.onPointerHoverEnter({ entity: handle, opts: { maxDistance: 100 } }, () => {
    for (const [h] of ringSegmentsMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      setRingMaterial(h, a, h === handle)
    }
  })

  pointerEventsSystem.onPointerHoverLeave({ entity: handle, opts: { maxDistance: 100 } }, () => {
    if (state.isDragging && state.dragAxis === axis) return
    for (const [h] of ringSegmentsMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      setRingMaterial(h, a, false)
    }
  })
}
