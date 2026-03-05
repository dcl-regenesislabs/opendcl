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
import { getActiveCameraTransform } from './camera'
// startDrag is injected via setStartDragHandler to avoid circular dependency with drag.ts
let _startDrag: ((axis: Axis) => void) | undefined
export function setStartDragHandler(fn: (axis: Axis) => void) { _startDrag = fn }

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
const GIZMO_MIN_SCALE = 0.4
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
  } else {
    createRotationHandle('x', root)
    createRotationHandle('y', root)
    createRotationHandle('z', root)
  }
}

export function destroyGizmo() {
  for (const e of gizmoEntities) {
    if (handleAxisMap.has(e)) {
      pointerEventsSystem.removeOnPointerDown(e)
      pointerEventsSystem.removeOnPointerHoverEnter(e)
      pointerEventsSystem.removeOnPointerHoverLeave(e)
      handleDiscMap.delete(e)
      handleArrowMap.delete(e)
      handleAxisMap.delete(e)
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
  g.position.x = center.x
  g.position.y = center.y
  g.position.z = center.z

  if (state.gizmoMode === 'rotate') {
    g.rotation.x = entityT.rotation.x
    g.rotation.y = entityT.rotation.y
    g.rotation.z = entityT.rotation.z
    g.rotation.w = entityT.rotation.w
  } else {
    g.rotation.x = 0
    g.rotation.y = 0
    g.rotation.z = 0
    g.rotation.w = 1
  }

  const gizmoPos = center

  // Scale gizmo: max of camera-distance-based and entity-size-based
  // 1) Camera distance → constant screen size
  const camT = getActiveCameraTransform()
  const dx = camT.position.x - gizmoPos.x
  const dy = camT.position.y - gizmoPos.y
  const dz = camT.position.z - gizmoPos.z
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

// ---- Rotation discs ----

export function setDiscMaterial(disc: Entity, axis: Axis, hovered: boolean) {
  const { c4, c3 } = AXIS_COLORS[axis]
  Material.setPbrMaterial(disc, {
    albedoColor: Color4.create(c4.r, c4.g, c4.b, hovered ? DISC_ALPHA_HOVER : DISC_ALPHA_DEFAULT),
    emissiveColor: c3,
    emissiveIntensity: hovered ? DISC_EMISSIVE_HOVER : DISC_EMISSIVE_DEFAULT,
    metallic: 0.5,
    roughness: 0.3,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  })
}

function createRotationHandle(axis: Axis, root: Entity) {
  const rot = AXIS_ROTATION[axis]

  const container = engine.addEntity()
  Transform.create(container, { position: Vector3.Zero(), rotation: rot, parent: root })
  gizmoEntities.push(container)
  editorEntities.add(container)

  const disc = engine.addEntity()
  Transform.create(disc, {
    position: Vector3.Zero(),
    scale: Vector3.create(RING_RADIUS * 2, RING_THICKNESS, RING_RADIUS * 2),
    parent: container,
  })
  MeshRenderer.setCylinder(disc)
  setDiscMaterial(disc, axis, false)
  gizmoEntities.push(disc)
  editorEntities.add(disc)

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
  handleDiscMap.set(handle, disc)

  pointerEventsSystem.onPointerDown(
    { entity: handle, opts: { button: InputAction.IA_POINTER, hoverText: `Rotate ${axis.toUpperCase()}`, maxDistance: 100 } },
    () => { setGizmoClickConsumed(true); _startDrag?.(axis) }
  )

  pointerEventsSystem.onPointerHoverEnter({ entity: handle, opts: { maxDistance: 100 } }, () => {
    for (const [h, d] of handleDiscMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      setDiscMaterial(d, a, h === handle)
    }
  })

  pointerEventsSystem.onPointerHoverLeave({ entity: handle, opts: { maxDistance: 100 } }, () => {
    if (state.isDragging && state.dragAxis === axis) return
    for (const [h, d] of handleDiscMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      setDiscMaterial(d, a, false)
    }
  })
}
