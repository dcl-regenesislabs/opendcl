/**
 * Scene Editor — auto-discovers entities and adds translate/rotate gizmos.
 *
 * Usage: import { enableEditor } from './__editor'
 *        Call enableEditor() at the end of your main() function.
 */

import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  MaterialTransparencyMode,
  GltfContainer,
  Name,
  pointerEventsSystem,
  inputSystem,
  InputAction,
  PointerEventType,
  PrimaryPointerInfo,
  ColliderLayer,
  executeTask
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { isServer } from '@dcl/sdk/network'
import { setupEditorUi } from './ui'
import { getRealm } from '~system/Runtime'
import {
  Axis,
  SelectableInfo,
  state,
  editorEntities,
  selectableInfoMap,
  originalMaterials,
  gizmoEntities,
  gizmoRoot,
  setGizmoRoot,
  selectionIndicatorEntities,
  handleAxisMap,
  handleDiscMap,
  handleArrowMap,
  gizmoClickConsumed,
  setGizmoClickConsumed,
} from './state'

// ============================================================
// Constants
// ============================================================

// Translate gizmo
const SHAFT_LENGTH = 1.2
const SHAFT_RADIUS = 0.04
const TIP_LENGTH = 0.3
const TIP_RADIUS = 0.12
const HANDLE_RADIUS = 0.18

// Rotate gizmo
const RING_RADIUS = 1.0
const RING_THICKNESS = 0.05
const RING_COLLIDER_THICKNESS = 0.2

// Axis colors
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

// Arrow hover
const ARROW_EMISSIVE_DEFAULT = 0.6
const ARROW_EMISSIVE_HOVER = 2.5

// Disc hover
const DISC_ALPHA_DEFAULT = 0.2
const DISC_ALPHA_HOVER = 0.6
const DISC_EMISSIVE_DEFAULT = 0.4
const DISC_EMISSIVE_HOVER = 1.5

// Selection highlight
const HIGHLIGHT_EMISSIVE = 0.6

// Wireframe indicator
const EDGE_THICKNESS = 0.025
const EDGE_COLOR = Color4.create(1, 0.85, 0.1, 1)
const EDGE_EMISSIVE = Color3.create(1, 0.75, 0.0)
const EDGE_EMISSIVE_INTENSITY = 3.0
const INDICATOR_PADDING = 0.15

// ============================================================
// Auto-Discovery
// ============================================================

/** Built-in entities to never register */
const SKIP_ENTITIES = new Set<Entity>()

function getEntityName(entity: Entity): string {
  // Prefer the Name component (stable identifier for save/load)
  if (Name.has(entity)) {
    return Name.get(entity).value
  }
  // Fallback: GltfContainer src filename
  if (GltfContainer.has(entity)) {
    const src = GltfContainer.get(entity).src
    const filename = src.split('/').pop() ?? src
    return filename.replace(/\.(glb|gltf)$/i, '')
  }
  // Fallback: primitive mesh type
  if (MeshRenderer.has(entity)) {
    const mr = MeshRenderer.get(entity) as any
    const meshCase = mr?.mesh?.$case ?? 'mesh'
    return `${meshCase} #${entity}`
  }
  return `entity #${entity}`
}

function detectMeshType(entity: Entity): 'box' | 'sphere' | 'cylinder' {
  if (!MeshRenderer.has(entity)) return 'box'
  try {
    const mr = MeshRenderer.get(entity) as any
    const c = mr?.mesh?.$case
    if (c === 'sphere') return 'sphere'
    if (c === 'cylinder') return 'cylinder'
  } catch {}
  return 'box'
}

function estimateBounds(entity: Entity): { centerOffset: Vector3; boundsSize: Vector3; isModel: boolean } {
  const t = Transform.get(entity)
  const s = t.scale ?? Vector3.One()

  if (GltfContainer.has(entity)) {
    // GLB model: pivot is often at the bottom, estimate center offset as half height
    // bounds = scale (model fills roughly 1m³ at scale 1)
    return {
      centerOffset: Vector3.create(0, Math.max(s.y * 0.5, 0.3), 0),
      boundsSize: Vector3.create(
        Math.max(s.x, 0.5),
        Math.max(s.y, 0.5),
        Math.max(s.z, 0.5)
      ),
      isModel: true,
    }
  }

  // Primitive: centered at origin, bounds = scale
  return {
    centerOffset: Vector3.Zero(),
    boundsSize: Vector3.create(s.x, s.y, s.z),
    isModel: false,
  }
}

function registerEntity(entity: Entity) {
  if (selectableInfoMap.has(entity)) return
  if (editorEntities.has(entity)) return
  if (SKIP_ENTITIES.has(entity)) return

  const { centerOffset, boundsSize, isModel } = estimateBounds(entity)
  const name = getEntityName(entity)
  const colliderShape = isModel ? 'box' : detectMeshType(entity)

  // Ensure entity has a pointer collider
  const hadMeshCollider = MeshCollider.has(entity)
  if (!hadMeshCollider) {
    MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  }

  // Save original GltfContainer collision masks
  let originalVisibleMask: number | undefined
  let originalInvisibleMask: number | undefined
  if (GltfContainer.has(entity)) {
    const gltf = GltfContainer.get(entity)
    originalVisibleMask = gltf.visibleMeshesCollisionMask
    originalInvisibleMask = gltf.invisibleMeshesCollisionMask
  }

  // Save original material for primitives (for highlight/unhighlight)
  if (!isModel && Material.has(entity)) {
    try {
      const mat = Material.get(entity) as any
      const pbr = mat?.pbr ?? mat?.material?.pbr
      if (pbr?.albedoColor) {
        const c = pbr.albedoColor
        originalMaterials.set(entity, { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0, a: c.a ?? 1 })
      }
    } catch {}
  }

  const info: SelectableInfo = {
    name,
    centerOffset,
    boundsSize,
    isModel,
    colliderShape,
    addedCollider: !hadMeshCollider,
    originalVisibleMask,
    originalInvisibleMask,
    src: GltfContainer.has(entity) ? GltfContainer.get(entity).src : undefined,
    meshType: !isModel ? colliderShape : undefined,
  }

  selectableInfoMap.set(entity, info)

  // Apply any pending overrides from editor-changes.json
  applyOverrides(entity)

  // Register click handler
  pointerEventsSystem.onPointerDown(
    {
      entity,
      opts: { button: InputAction.IA_POINTER, hoverText: `Select ${name}`, maxDistance: 30 },
    },
    () => {
      if (state.isDragging || gizmoClickConsumed) return
      selectEntity(entity)
    }
  )
}

function discoverySystem() {
  // Discover primitives
  for (const [entity] of engine.getEntitiesWith(Transform, MeshRenderer)) {
    if (!selectableInfoMap.has(entity) && !editorEntities.has(entity) && !SKIP_ENTITIES.has(entity)) {
      registerEntity(entity)
    }
  }
  // Discover GLB models
  for (const [entity] of engine.getEntitiesWith(Transform, GltfContainer)) {
    if (!selectableInfoMap.has(entity) && !editorEntities.has(entity) && !SKIP_ENTITIES.has(entity)) {
      registerEntity(entity)
    }
  }
}

// ============================================================
// Selection
// ============================================================

function disableCollider(entity: Entity) {
  if (MeshCollider.has(entity)) {
    MeshCollider.deleteFrom(entity)
  }
  // Zero out GLB built-in colliders so rays pass through to gizmo
  if (GltfContainer.has(entity)) {
    const gltf = GltfContainer.getMutable(entity)
    gltf.visibleMeshesCollisionMask = 0
    gltf.invisibleMeshesCollisionMask = 0
  }
}

function restoreCollider(entity: Entity) {
  const info = selectableInfoMap.get(entity)
  if (!info) return

  // Restore MeshCollider
  switch (info.colliderShape) {
    case 'box':
      MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
      break
    case 'sphere':
      MeshCollider.setSphere(entity, ColliderLayer.CL_POINTER)
      break
    case 'cylinder':
      MeshCollider.setCylinder(entity, undefined, undefined, ColliderLayer.CL_POINTER)
      break
  }

  // Restore GLB built-in colliders
  if (GltfContainer.has(entity) && info.originalVisibleMask !== undefined) {
    const gltf = GltfContainer.getMutable(entity)
    gltf.visibleMeshesCollisionMask = info.originalVisibleMask
    gltf.invisibleMeshesCollisionMask = info.originalInvisibleMask ?? 0
  }
}

function selectEntity(entity: Entity) {
  if (state.selectedEntity === entity) {
    deselectEntity()
    return
  }

  if (state.selectedEntity !== undefined) {
    unhighlight(state.selectedEntity)
    restoreCollider(state.selectedEntity)
    destroyGizmo()
    destroySelectionIndicator()
  }

  const info = selectableInfoMap.get(entity)
  if (!info) return

  state.selectedEntity = entity
  state.selectedName = info.name
  highlight(entity)
  disableCollider(entity)
  createGizmo()
  createSelectionIndicator(entity, info)
  console.log(`Selected: ${info.name}`)
}

function deselectEntity() {
  if (state.selectedEntity !== undefined) {
    unhighlight(state.selectedEntity)
    restoreCollider(state.selectedEntity)
    destroyGizmo()
    destroySelectionIndicator()
    state.selectedEntity = undefined
    state.selectedName = ''
  }
}

function highlight(entity: Entity) {
  const m = originalMaterials.get(entity)
  if (!m) return
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(m.r, m.g, m.b, m.a),
    emissiveColor: Color3.create(m.r * 0.4, m.g * 0.4, m.b * 0.4),
    emissiveIntensity: HIGHLIGHT_EMISSIVE,
    metallic: 0.1,
    roughness: 0.4,
  })
}

function unhighlight(entity: Entity) {
  const m = originalMaterials.get(entity)
  if (!m) return
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(m.r, m.g, m.b, m.a),
    metallic: 0.1,
    roughness: 0.5,
  })
}

// ============================================================
// Selection Indicator — wireframe bounding box
// ============================================================

function createEdge(parent: Entity, pos: Vector3, scale: Vector3) {
  const edge = engine.addEntity()
  Transform.create(edge, { position: pos, scale, parent })
  MeshRenderer.setBox(edge)
  Material.setPbrMaterial(edge, {
    albedoColor: EDGE_COLOR,
    emissiveColor: EDGE_EMISSIVE,
    emissiveIntensity: EDGE_EMISSIVE_INTENSITY,
    metallic: 0,
    roughness: 1,
  })
  selectionIndicatorEntities.push(edge)
  editorEntities.add(edge)
}

function createSelectionIndicator(entity: Entity, info: SelectableInfo) {
  destroySelectionIndicator()

  const anchor = engine.addEntity()
  Transform.create(anchor, {
    position: Vector3.create(info.centerOffset.x, info.centerOffset.y, info.centerOffset.z),
    parent: entity,
  })
  selectionIndicatorEntities.push(anchor)
  editorEntities.add(anchor)

  const hw = (info.boundsSize.x + INDICATOR_PADDING) / 2
  const hh = (info.boundsSize.y + INDICATOR_PADDING) / 2
  const hd = (info.boundsSize.z + INDICATOR_PADDING) / 2
  const t = EDGE_THICKNESS
  const sx = info.boundsSize.x + INDICATOR_PADDING
  const sy = info.boundsSize.y + INDICATOR_PADDING
  const sz = info.boundsSize.z + INDICATOR_PADDING

  // 4 edges along X
  createEdge(anchor, Vector3.create(0, +hh, +hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, +hh, -hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, -hh, +hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, -hh, -hd), Vector3.create(sx, t, t))
  // 4 edges along Y
  createEdge(anchor, Vector3.create(+hw, 0, +hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(+hw, 0, -hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(-hw, 0, +hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(-hw, 0, -hd), Vector3.create(t, sy, t))
  // 4 edges along Z
  createEdge(anchor, Vector3.create(+hw, +hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(+hw, -hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(-hw, +hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(-hw, -hh, 0), Vector3.create(t, t, sz))
}

function destroySelectionIndicator() {
  for (const e of selectionIndicatorEntities) {
    editorEntities.delete(e)
    engine.removeEntity(e)
  }
  selectionIndicatorEntities.length = 0
}

// ============================================================
// Gizmo
// ============================================================

function getGizmoCenter(entity: Entity): Vector3 {
  const pos = Transform.get(entity).position
  const info = selectableInfoMap.get(entity)
  const offset = info?.centerOffset ?? Vector3.Zero()
  return Vector3.create(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z)
}

function createGizmo() {
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

// ---- Translate arrows ----

function setArrowMaterial(entity: Entity, axis: Axis, hovered: boolean) {
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
    { entity: handle, opts: { button: InputAction.IA_POINTER, hoverText: `Move ${axis.toUpperCase()}`, maxDistance: 30 } },
    () => { setGizmoClickConsumed(true); startDrag(axis) }
  )

  pointerEventsSystem.onPointerHoverEnter({ entity: handle }, () => {
    for (const [h, parts] of handleArrowMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      for (const p of parts) setArrowMaterial(p, a, h === handle)
    }
  })

  pointerEventsSystem.onPointerHoverLeave({ entity: handle }, () => {
    if (state.isDragging && state.dragAxis === axis) return
    for (const [h, parts] of handleArrowMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      for (const p of parts) setArrowMaterial(p, a, false)
    }
  })
}

// ---- Rotation discs ----

function setDiscMaterial(disc: Entity, axis: Axis, hovered: boolean) {
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
    { entity: handle, opts: { button: InputAction.IA_POINTER, hoverText: `Rotate ${axis.toUpperCase()}`, maxDistance: 30 } },
    () => { setGizmoClickConsumed(true); startDrag(axis) }
  )

  pointerEventsSystem.onPointerHoverEnter({ entity: handle }, () => {
    for (const [h, d] of handleDiscMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      setDiscMaterial(d, a, h === handle)
    }
  })

  pointerEventsSystem.onPointerHoverLeave({ entity: handle }, () => {
    if (state.isDragging && state.dragAxis === axis) return
    for (const [h, d] of handleDiscMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      setDiscMaterial(d, a, false)
    }
  })
}

// ---- Gizmo destroy & follow ----

function destroyGizmo() {
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

function gizmoFollowSystem() {
  if (gizmoRoot === undefined || state.selectedEntity === undefined) return
  if (!Transform.has(state.selectedEntity)) return

  const entityT = Transform.get(state.selectedEntity)
  const info = selectableInfoMap.get(state.selectedEntity)
  const offset = info?.centerOffset ?? Vector3.Zero()

  const g = Transform.getMutable(gizmoRoot)

  if (state.gizmoMode === 'rotate') {
    const rotatedOffset = Vector3.rotate(offset, entityT.rotation)
    g.position.x = entityT.position.x + rotatedOffset.x
    g.position.y = entityT.position.y + rotatedOffset.y
    g.position.z = entityT.position.z + rotatedOffset.z
    g.rotation.x = entityT.rotation.x
    g.rotation.y = entityT.rotation.y
    g.rotation.z = entityT.rotation.z
    g.rotation.w = entityT.rotation.w
  } else {
    const center = getGizmoCenter(state.selectedEntity)
    g.position.x = center.x
    g.position.y = center.y
    g.position.z = center.z
    g.rotation.x = 0
    g.rotation.y = 0
    g.rotation.z = 0
    g.rotation.w = 1
  }
}

// ============================================================
// Ray-Plane Intersection Drag
// ============================================================

function axisToVector(axis: Axis): Vector3 {
  switch (axis) {
    case 'x': return Vector3.Right()
    case 'y': return Vector3.Up()
    case 'z': return Vector3.Forward()
  }
}

function getDragPlaneNormal(axis: Axis, cameraForward: Vector3): Vector3 {
  const candidates: Vector3[] = []
  if (axis !== 'x') candidates.push(Vector3.Right())
  if (axis !== 'y') candidates.push(Vector3.Up())
  if (axis !== 'z') candidates.push(Vector3.Forward())

  let best = candidates[0]
  let bestDot = 0
  for (const n of candidates) {
    const d = Math.abs(Vector3.dot(cameraForward, n))
    if (d > bestDot) { bestDot = d; best = n }
  }
  return best
}

function rayPlaneIntersect(
  rayOrigin: Vector3, rayDir: Vector3, planePoint: Vector3, planeNormal: Vector3
): Vector3 | null {
  const denom = Vector3.dot(planeNormal, rayDir)
  if (Math.abs(denom) < 1e-6) return null
  const diff = Vector3.subtract(planePoint, rayOrigin)
  const t = Vector3.dot(diff, planeNormal) / denom
  if (t < 0) return null
  return Vector3.add(rayOrigin, Vector3.scale(rayDir, t))
}

function hitAngleOnPlane(hit: Vector3, center: Vector3, axis: Axis): number {
  const d = Vector3.subtract(hit, center)
  switch (axis) {
    case 'x': return Math.atan2(d.z, d.y)
    case 'y': return Math.atan2(d.x, d.z)
    case 'z': return Math.atan2(d.y, d.x)
  }
}

function startDrag(axis: Axis) {
  if (state.selectedEntity === undefined || !Transform.has(state.selectedEntity)) return

  const entityPos = Transform.get(state.selectedEntity).position
  const cameraT = Transform.get(engine.CameraEntity)
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
}

function dragSystem(_dt: number) {
  if (!state.isDragging || state.selectedEntity === undefined || !Transform.has(state.selectedEntity))
    return

  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) { endDrag(); return }
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) { endDrag(); return }

  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  if (!pointer || !pointer.worldRayDirection) return
  const cameraT = Transform.get(engine.CameraEntity)

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

  // Send update to preview server
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

// ============================================================
// Mode Toggle & Deselect
// ============================================================

function modeToggleSystem() {
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    if (state.isDragging) return
    state.gizmoMode = state.gizmoMode === 'translate' ? 'rotate' : 'translate'
    console.log(`[editor] mode: ${state.gizmoMode}`)
    if (state.selectedEntity !== undefined) createGizmo()
  }

  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    if (state.isDragging) return
    deselectEntity()
  }
}

function resetGizmoClickFlag() {
  if (gizmoClickConsumed) setGizmoClickConsumed(false)
}

// ============================================================
// WebSocket — auto-send changes to preview server
// ============================================================

let editorWs: WebSocket | null = null
let serverBaseUrl: string | null = null

function round(v: number, decimals: number = 2): number {
  const f = Math.pow(10, decimals)
  return Math.round(v * f) / f
}

/** Send a single entity's current transform to the preview server via WS */
function sendEntityUpdate(entity: Entity) {
  if (!editorWs || editorWs.readyState !== WebSocket.OPEN) return
  if (!Transform.has(entity)) return

  const info = selectableInfoMap.get(entity)
  if (!info) return

  const t = Transform.get(entity)

  const msg = {
    type: 'editor-update',
    name: info.name,
    components: {
      Transform: {
        position: { x: round(t.position.x), y: round(t.position.y), z: round(t.position.z) },
        rotation: { x: round(t.rotation.x, 4), y: round(t.rotation.y, 4), z: round(t.rotation.z, 4), w: round(t.rotation.w, 4) },
        scale: { x: round(t.scale.x), y: round(t.scale.y), z: round(t.scale.z) },
      },
    },
  }

  editorWs.send(JSON.stringify(msg))
  state.pendingChanges++
}

/** Connect WebSocket to the preview server */
function connectEditorWs() {
  executeTask(async () => {
    try {
      const realm = await getRealm({})
      const baseUrl = realm.realmInfo?.baseUrl
      if (!baseUrl) {
        console.log('[editor] no realm baseUrl — running without persistence')
        return
      }
      serverBaseUrl = baseUrl

      const wsUrl = baseUrl.replace(/^http/, 'ws')
      console.log(`[editor] connecting to ${wsUrl}`)

      editorWs = new WebSocket(wsUrl)

      editorWs.onopen = () => {
        state.wsConnected = true
        console.log('[editor] ws connected')
      }

      editorWs.onclose = () => {
        state.wsConnected = false
        editorWs = null
      }

      editorWs.onerror = () => {
        // Error is followed by close
      }
    } catch (err) {
      console.log(`[editor] ws connect failed: ${err}`)
    }
  })
}

// ============================================================
// Load overrides — fetch from server's in-memory store
// ============================================================

/** Pending overrides, keyed by entity name */
interface ComponentOverrides {
  Transform?: {
    position?: { x: number; y: number; z: number }
    rotation?: { x: number; y: number; z: number; w: number }
    scale?: { x: number; y: number; z: number }
  }
}
const pendingOverrides = new Map<string, ComponentOverrides>()

/** Fetch overrides from server and apply to already-discovered entities */
function loadEditorOverrides() {
  executeTask(async () => {
    try {
      const realm = await getRealm({})
      const baseUrl = realm.realmInfo?.baseUrl
      if (!baseUrl) return

      const response = await fetch(`${baseUrl}/editor/changes`)
      if (!response.ok) return

      const text = await response.text()
      const data = JSON.parse(text) as Record<string, { components?: ComponentOverrides }>
      let count = 0
      for (const [name, entry] of Object.entries(data)) {
        if (entry.components) {
          pendingOverrides.set(name, entry.components)
          count++
        }
      }
      if (count > 0) {
        console.log(`[editor] loaded ${count} overrides from server`)
        // Entities are already discovered (enableEditor runs after main),
        // so apply to all known entities
        for (const [entity] of selectableInfoMap) {
          applyOverrides(entity)
        }
      }
    } catch {
      // Server not reachable — no overrides to apply
    }
  })
}

/** Apply pending overrides to an entity — direct merge, no conversion */
function applyOverrides(entity: Entity) {
  const info = selectableInfoMap.get(entity)
  if (!info) return
  const overrides = pendingOverrides.get(info.name)
  if (!overrides) return

  if (overrides.Transform && Transform.has(entity)) {
    const t = Transform.getMutable(entity)
    if (overrides.Transform.position) {
      t.position = overrides.Transform.position
    }
    if (overrides.Transform.rotation) {
      t.rotation = overrides.Transform.rotation
    }
    if (overrides.Transform.scale) {
      t.scale = overrides.Transform.scale
    }
  }

  pendingOverrides.delete(info.name)
}

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

  // Invisible ground plane for deselect-on-click (huge, no MeshRenderer)
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

  // Register all systems
  engine.addSystem(discoverySystem, 100)            // run early — discover new entities
  engine.addSystem(dragSystem)
  engine.addSystem(gizmoFollowSystem)
  engine.addSystem(modeToggleSystem)
  engine.addSystem(resetGizmoClickFlag, Number.MAX_SAFE_INTEGER) // run last

  // Load overrides from server + connect WS for auto-saving
  loadEditorOverrides()
  connectEditorWs()

  setupEditorUi()
  console.log('[editor] enabled — click objects to select, E to toggle Move/Rotate, F to deselect')
}
