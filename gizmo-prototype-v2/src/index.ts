/**
 * Gizmo Prototype v2 — Ray-plane intersection drag
 *
 * Differences from v1:
 * - Drag uses ray-plane intersection (camera ray vs axis-aligned plane)
 * - Gizmo is world-space aligned (not parented to selection, follows position each frame)
 * - Arrow tips are actual cones (radiusTop = 0)
 * - Smaller, cleaner gizmo proportions
 * - No unnecessary Material on invisible collider handles
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
  pointerEventsSystem,
  inputSystem,
  InputAction,
  PointerEventType,
  PrimaryPointerInfo,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { setupUi } from './ui'
import {
  Axis,
  SelectableInfo,
  state,
  gizmoEntities,
  gizmoRoot,
  setGizmoRoot,
  selectionIndicatorEntities,
  handleAxisMap,
  handleDiscMap,
  handleArrowMap,
  selectableInfoMap,
  originalMaterials,
  gizmoClickConsumed,
  setGizmoClickConsumed,
} from './state'

// ============================================================
// Constants
// ============================================================

const SHAFT_LENGTH = 1.2
const SHAFT_RADIUS = 0.04
const TIP_LENGTH = 0.3
const TIP_RADIUS = 0.12
const HANDLE_RADIUS = 0.18

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

// Rotate gizmo
const RING_RADIUS = 1.0       // radius of the disc
const RING_THICKNESS = 0.05   // how thin the disc is (Y scale)
const RING_COLLIDER_THICKNESS = 0.2

// Arrow hover feedback
const ARROW_EMISSIVE_DEFAULT = 0.6
const ARROW_EMISSIVE_HOVER = 2.5
const ARROW_ALPHA_DEFAULT = 1.0
const ARROW_ALPHA_HOVER = 1.0

const HIGHLIGHT_EMISSIVE = 0.6

// ============================================================
// Scene Objects
// ============================================================

function createSceneObjects() {
  // Ground — 2x2 parcels = 32x32m
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(16, 0, 16),
    scale: Vector3.create(32, 0.1, 32),
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground, ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(ground, {
    albedoColor: Color4.create(0.25, 0.25, 0.28, 1),
    metallic: 0,
    roughness: 0.9,
  })

  // Click ground to deselect
  pointerEventsSystem.onPointerDown(
    {
      entity: ground,
      opts: { button: InputAction.IA_POINTER, maxDistance: 60, showFeedback: false },
    },
    () => {
      if (state.isDragging || gizmoClickConsumed) return
      deselectEntity()
    }
  )

  // === Primitives (row 1, z=8) ===
  addSelectable('Red Cube', Vector3.create(5, 1, 8), 'box', Vector3.One(), Color4.create(0.8, 0.3, 0.2, 1))
  addSelectable('Blue Sphere', Vector3.create(10, 1, 8), 'sphere', Vector3.One(), Color4.create(0.2, 0.4, 0.85, 1))
  addSelectable('Green Cylinder', Vector3.create(15, 1, 8), 'cylinder', Vector3.create(0.8, 1.5, 0.8), Color4.create(0.2, 0.7, 0.3, 1))
  addSelectable('Yellow Cube', Vector3.create(20, 0.4, 8), 'box', Vector3.create(0.6, 0.6, 0.6), Color4.create(0.9, 0.8, 0.15, 1))

  // === Models row 2 (z=15) ===
  addSelectableModel('Barrel', Vector3.create(4, 0, 15), 'models/Barrel.glb', {
    centerOffset: Vector3.create(0, 0.7, 0),
    boundsSize: Vector3.create(0.8, 1.4, 0.8),
  })
  addSelectableModel('Armchair', Vector3.create(9, 0, 15), 'models/Armchair_C.glb', {
    centerOffset: Vector3.create(0, 0.5, 0),
    boundsSize: Vector3.create(0.8, 1.0, 0.8),
  })
  addSelectableModel('Treasure Sword', Vector3.create(14, 0, 15), 'models/Treasure_Sword.glb', {
    centerOffset: Vector3.create(0, 0.4, 0),
    boundsSize: Vector3.create(0.3, 0.8, 0.3),
  })
  addSelectableModel('Sci-Fi Droid', Vector3.create(19, 0, 15), 'models/Radiator_Droid.glb', {
    centerOffset: Vector3.create(0, 0.6, 0),
    boundsSize: Vector3.create(0.6, 1.2, 0.6),
  })
  addSelectableModel('Mushrooms', Vector3.create(24, 0, 15), 'models/Mushrooms.glb', {
    centerOffset: Vector3.create(0, 0.3, 0),
    boundsSize: Vector3.create(0.6, 0.6, 0.6),
  })

  // === Models row 3 (z=22) ===
  addSelectableModel('Fantasy Chest', Vector3.create(4, 0, 22), 'models/Fantasy_Chest.glb', {
    centerOffset: Vector3.create(0, 0.4, 0),
    boundsSize: Vector3.create(0.8, 0.8, 0.6),
  })
  addSelectableModel('Lamp', Vector3.create(9, 0, 22), 'models/Lamp.glb', {
    centerOffset: Vector3.create(0, 0.5, 0),
    boundsSize: Vector3.create(0.5, 1.0, 0.5),
  })
  addSelectableModel('Old TV', Vector3.create(14, 0, 22), 'models/Old_TV.glb', {
    centerOffset: Vector3.create(0, 0.5, 0),
    boundsSize: Vector3.create(0.7, 0.8, 0.5),
  })
  addSelectableModel('Bonfire', Vector3.create(19, 0, 22), 'models/Bonfire.glb', {
    centerOffset: Vector3.create(0, 0.4, 0),
    boundsSize: Vector3.create(0.8, 0.8, 0.8),
  })
  addSelectableModel('Mine Cart', Vector3.create(24, 0, 22), 'models/Mines_Cart.glb', {
    centerOffset: Vector3.create(0, 0.5, 0),
    boundsSize: Vector3.create(1.0, 1.0, 0.6),
  })

  // === Bonus: Steampunk Bench (z=28) ===
  addSelectableModel('Steampunk Bench', Vector3.create(14, 0, 28), 'models/Steampunk_Bench.glb', {
    centerOffset: Vector3.create(0, 0.5, 0),
    boundsSize: Vector3.create(1.5, 1.0, 0.6),
  })
}

function addSelectable(
  name: string,
  position: Vector3,
  shape: 'box' | 'sphere' | 'cylinder',
  scale: Vector3,
  color: Color4
) {
  const entity = engine.addEntity()
  Transform.create(entity, { position, scale })

  if (shape === 'box') {
    MeshRenderer.setBox(entity)
    MeshCollider.setBox(entity)
  } else if (shape === 'sphere') {
    MeshRenderer.setSphere(entity)
    MeshCollider.setSphere(entity)
  } else {
    MeshRenderer.setCylinder(entity)
    MeshCollider.setCylinder(entity)
  }

  Material.setPbrMaterial(entity, { albedoColor: color, metallic: 0.1, roughness: 0.5 })
  originalMaterials.set(entity, { r: color.r, g: color.g, b: color.b, a: color.a })

  // Primitives are centered at their origin, bounds = scale
  selectableInfoMap.set(entity, {
    name,
    centerOffset: Vector3.Zero(),
    boundsSize: Vector3.create(scale.x, scale.y, scale.z),
    isModel: false,
    colliderShape: shape,
  })

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

function addSelectableModel(
  name: string,
  position: Vector3,
  src: string,
  opts?: {
    scale?: Vector3
    /** Local offset from entity origin to visual center (Y-up). E.g. {0, 0.75, 0} for a 1.5m tall model with pivot at bottom */
    centerOffset?: Vector3
    /** Approximate bounding box size for the selection indicator */
    boundsSize?: Vector3
  }
) {
  const entity = engine.addEntity()
  const s = opts?.scale ?? Vector3.One()
  Transform.create(entity, { position, scale: s })
  GltfContainer.create(entity, { src })
  // GLB models need an explicit collider for pointer events — use a box approximation
  MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)

  const centerOffset = opts?.centerOffset ?? Vector3.create(0, 0.5, 0)
  const boundsSize = opts?.boundsSize ?? Vector3.create(1, 1, 1)

  selectableInfoMap.set(entity, {
    name,
    centerOffset,
    boundsSize,
    isModel: true,
    colliderShape: 'box', // GLB models always use box collider approximation
  })

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

// ============================================================
// Selection
// ============================================================

/** Remove collider from selected entity so clicks pass through to gizmo handles */
function disableCollider(entity: Entity) {
  if (MeshCollider.has(entity)) {
    MeshCollider.deleteFrom(entity)
  }
}

/** Restore collider on deselect so entity is clickable again */
function restoreCollider(entity: Entity) {
  const info = selectableInfoMap.get(entity)
  if (!info) return
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
// Selection Indicator — wireframe bounding box (12 glowing edges)
// ============================================================

const EDGE_THICKNESS = 0.025
const EDGE_COLOR = Color4.create(1, 0.85, 0.1, 1)
const EDGE_EMISSIVE = Color3.create(1, 0.75, 0.0)
const EDGE_EMISSIVE_INTENSITY = 3.0
const INDICATOR_PADDING = 0.15

function createEdge(
  parent: Entity,
  pos: Vector3,
  scale: Vector3
) {
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
}

function createSelectionIndicator(entity: Entity, info: SelectableInfo) {
  destroySelectionIndicator()

  // Anchor parented to entity at the visual center
  const anchor = engine.addEntity()
  Transform.create(anchor, {
    position: Vector3.create(info.centerOffset.x, info.centerOffset.y, info.centerOffset.z),
    parent: entity,
  })
  selectionIndicatorEntities.push(anchor)

  const hw = (info.boundsSize.x + INDICATOR_PADDING) / 2  // half-width (X)
  const hh = (info.boundsSize.y + INDICATOR_PADDING) / 2  // half-height (Y)
  const hd = (info.boundsSize.z + INDICATOR_PADDING) / 2  // half-depth (Z)
  const t = EDGE_THICKNESS
  const sx = info.boundsSize.x + INDICATOR_PADDING  // full edge length X
  const sy = info.boundsSize.y + INDICATOR_PADDING  // full edge length Y
  const sz = info.boundsSize.z + INDICATOR_PADDING  // full edge length Z

  // 4 edges along X (horizontal, left-right)
  createEdge(anchor, Vector3.create(0, +hh, +hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, +hh, -hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, -hh, +hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, -hh, -hd), Vector3.create(sx, t, t))

  // 4 edges along Y (vertical)
  createEdge(anchor, Vector3.create(+hw, 0, +hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(+hw, 0, -hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(-hw, 0, +hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(-hw, 0, -hd), Vector3.create(t, sy, t))

  // 4 edges along Z (depth)
  createEdge(anchor, Vector3.create(+hw, +hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(+hw, -hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(-hw, +hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(-hw, -hh, 0), Vector3.create(t, t, sz))
}

function destroySelectionIndicator() {
  for (const e of selectionIndicatorEntities) {
    engine.removeEntity(e)
  }
  selectionIndicatorEntities.length = 0
}

// ============================================================
// Gizmo — World-space aligned (not parented to selection)
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

function setArrowMaterial(entity: Entity, axis: Axis, hovered: boolean) {
  const { c4, c3 } = AXIS_COLORS[axis]
  const emissive = hovered ? ARROW_EMISSIVE_HOVER : ARROW_EMISSIVE_DEFAULT
  Material.setPbrMaterial(entity, {
    albedoColor: c4,
    emissiveColor: c3,
    emissiveIntensity: emissive,
    metallic: 0.7,
    roughness: 0.25,
  })
}

function createArrow(axis: Axis, root: Entity) {
  const rot = AXIS_ROTATION[axis]

  // Container: rotates the arrow to align with the world axis
  const container = engine.addEntity()
  Transform.create(container, {
    position: Vector3.Zero(),
    rotation: rot,
    parent: root,
  })
  gizmoEntities.push(container)

  // Shaft — thin cylinder along local Y
  const shaft = engine.addEntity()
  Transform.create(shaft, {
    position: Vector3.create(0, SHAFT_LENGTH / 2, 0),
    scale: Vector3.create(1, SHAFT_LENGTH, 1),
    parent: container,
  })
  MeshRenderer.setCylinder(shaft, SHAFT_RADIUS, SHAFT_RADIUS)
  setArrowMaterial(shaft, axis, false)
  gizmoEntities.push(shaft)

  // Tip — cone (radiusBottom wide, radiusTop = 0)
  const tip = engine.addEntity()
  Transform.create(tip, {
    position: Vector3.create(0, SHAFT_LENGTH + TIP_LENGTH / 2, 0),
    scale: Vector3.create(1, TIP_LENGTH, 1),
    parent: container,
  })
  MeshRenderer.setCylinder(tip, TIP_RADIUS, 0)
  setArrowMaterial(tip, axis, false)
  gizmoEntities.push(tip)

  // Invisible fat collider for easier clicking (no MeshRenderer = invisible)
  const handle = engine.addEntity()
  Transform.create(handle, {
    position: Vector3.create(0, (SHAFT_LENGTH + TIP_LENGTH) / 2, 0),
    scale: Vector3.create(1, SHAFT_LENGTH + TIP_LENGTH, 1),
    parent: container,
  })
  MeshCollider.setCylinder(handle, HANDLE_RADIUS, HANDLE_RADIUS, ColliderLayer.CL_POINTER)
  gizmoEntities.push(handle)

  handleAxisMap.set(handle, axis)
  handleArrowMap.set(handle, [shaft, tip])

  pointerEventsSystem.onPointerDown(
    {
      entity: handle,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: `Move ${axis.toUpperCase()}`,
        maxDistance: 30,
      },
    },
    () => {
      setGizmoClickConsumed(true)
      startDrag(axis)
    }
  )

  // Hover highlight: brighten this arrow, dim others
  pointerEventsSystem.onPointerHoverEnter(
    { entity: handle },
    () => {
      for (const [h, parts] of handleArrowMap) {
        const a = handleAxisMap.get(h)
        if (!a) continue
        const lit = h === handle
        for (const p of parts) setArrowMaterial(p, a, lit)
      }
    }
  )

  pointerEventsSystem.onPointerHoverLeave(
    { entity: handle },
    () => {
      if (state.isDragging && state.dragAxis === axis) return
      for (const [h, parts] of handleArrowMap) {
        const a = handleAxisMap.get(h)
        if (!a) continue
        for (const p of parts) setArrowMaterial(p, a, false)
      }
    }
  )
}

const DISC_ALPHA_DEFAULT = 0.2
const DISC_ALPHA_HOVER = 0.6
const DISC_EMISSIVE_DEFAULT = 0.4
const DISC_EMISSIVE_HOVER = 1.5

function setDiscMaterial(disc: Entity, axis: Axis, hovered: boolean) {
  const { c4, c3 } = AXIS_COLORS[axis]
  const alpha = hovered ? DISC_ALPHA_HOVER : DISC_ALPHA_DEFAULT
  const emissive = hovered ? DISC_EMISSIVE_HOVER : DISC_EMISSIVE_DEFAULT
  Material.setPbrMaterial(disc, {
    albedoColor: Color4.create(c4.r, c4.g, c4.b, alpha),
    emissiveColor: c3,
    emissiveIntensity: emissive,
    metallic: 0.5,
    roughness: 0.3,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  })
}

function createRotationHandle(axis: Axis, root: Entity) {
  const rot = AXIS_ROTATION[axis]

  // Container: rotates the disc so its flat face is perpendicular to the axis
  const container = engine.addEntity()
  Transform.create(container, {
    position: Vector3.Zero(),
    rotation: rot,
    parent: root,
  })
  gizmoEntities.push(container)

  // Visible disc — flat cylinder (thin Y, wide X/Z)
  const disc = engine.addEntity()
  Transform.create(disc, {
    position: Vector3.Zero(),
    scale: Vector3.create(RING_RADIUS * 2, RING_THICKNESS, RING_RADIUS * 2),
    parent: container,
  })
  MeshRenderer.setCylinder(disc)
  setDiscMaterial(disc, axis, false)
  gizmoEntities.push(disc)

  // Invisible fat collider for easier clicking
  const handle = engine.addEntity()
  Transform.create(handle, {
    position: Vector3.Zero(),
    scale: Vector3.create(RING_RADIUS * 2, RING_COLLIDER_THICKNESS, RING_RADIUS * 2),
    parent: container,
  })
  MeshCollider.setCylinder(handle, 0.5, 0.5, ColliderLayer.CL_POINTER)
  gizmoEntities.push(handle)

  handleAxisMap.set(handle, axis)
  handleDiscMap.set(handle, disc)

  pointerEventsSystem.onPointerDown(
    {
      entity: handle,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: `Rotate ${axis.toUpperCase()}`,
        maxDistance: 30,
      },
    },
    () => {
      setGizmoClickConsumed(true)
      startDrag(axis)
    }
  )

  // Hover highlight: brighten this disc, dim others
  pointerEventsSystem.onPointerHoverEnter(
    { entity: handle },
    () => {
      // Brighten hovered disc, dim all others
      for (const [h, d] of handleDiscMap) {
        const a = handleAxisMap.get(h)
        if (!a) continue
        setDiscMaterial(d, a, h === handle)
      }
    }
  )

  pointerEventsSystem.onPointerHoverLeave(
    { entity: handle },
    () => {
      // Don't dim if we're actively dragging this axis — keep it highlighted
      if (state.isDragging && state.dragAxis === axis) return
      // Restore all discs to default
      for (const [h, d] of handleDiscMap) {
        const a = handleAxisMap.get(h)
        if (!a) continue
        setDiscMaterial(d, a, false)
      }
    }
  )
}

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
    engine.removeEntity(e)
  }
  gizmoEntities.length = 0
  setGizmoRoot(undefined)
}

// ============================================================
// Gizmo follow — keeps gizmo at the selected entity's position
// ============================================================

function gizmoFollowSystem() {
  if (gizmoRoot === undefined || state.selectedEntity === undefined) return
  if (!Transform.has(state.selectedEntity)) return

  const entityT = Transform.get(state.selectedEntity)
  const info = selectableInfoMap.get(state.selectedEntity)
  const offset = info?.centerOffset ?? Vector3.Zero()

  const g = Transform.getMutable(gizmoRoot)

  if (state.gizmoMode === 'rotate') {
    // Rotate mode: gizmo rotates with the entity so discs stay aligned to local axes
    const rotatedOffset = Vector3.rotate(offset, entityT.rotation)
    g.position.x = entityT.position.x + rotatedOffset.x
    g.position.y = entityT.position.y + rotatedOffset.y
    g.position.z = entityT.position.z + rotatedOffset.z
    g.rotation.x = entityT.rotation.x
    g.rotation.y = entityT.rotation.y
    g.rotation.z = entityT.rotation.z
    g.rotation.w = entityT.rotation.w
  } else {
    // Translate mode: gizmo stays world-axis-aligned, just follows position
    const center = getGizmoCenter(state.selectedEntity)
    g.position.x = center.x
    g.position.y = center.y
    g.position.z = center.z
    // Reset rotation to identity in case we switched from rotate mode
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
    case 'x':
      return Vector3.Right() // (1,0,0)
    case 'y':
      return Vector3.Up() // (0,1,0)
    case 'z':
      return Vector3.Forward() // (0,0,1)
  }
}

/**
 * Pick the drag plane normal. The plane contains the drag axis and faces the
 * camera as much as possible. We pick from the two world-axis-aligned planes
 * that contain the drag axis, choosing the one most face-on to the camera.
 */
function getDragPlaneNormal(axis: Axis, cameraForward: Vector3): Vector3 {
  const candidates: Vector3[] = []
  if (axis !== 'x') candidates.push(Vector3.Right())
  if (axis !== 'y') candidates.push(Vector3.Up())
  if (axis !== 'z') candidates.push(Vector3.Forward())

  let best = candidates[0]
  let bestDot = 0
  for (const n of candidates) {
    const d = Math.abs(Vector3.dot(cameraForward, n))
    if (d > bestDot) {
      bestDot = d
      best = n
    }
  }
  return best
}

/**
 * Intersect ray (origin + t * dir) with plane (dot(normal, P - point) = 0).
 * Returns intersection point or null if parallel / behind camera.
 */
function rayPlaneIntersect(
  rayOrigin: Vector3,
  rayDir: Vector3,
  planePoint: Vector3,
  planeNormal: Vector3
): Vector3 | null {
  const denom = Vector3.dot(planeNormal, rayDir)
  if (Math.abs(denom) < 1e-6) return null

  const diff = Vector3.subtract(planePoint, rayOrigin)
  const t = Vector3.dot(diff, planeNormal) / denom
  if (t < 0) return null

  return Vector3.add(rayOrigin, Vector3.scale(rayDir, t))
}

/**
 * Given a hit point on the rotation plane and the center, compute the angle
 * using atan2 on the two in-plane axes.
 */
function hitAngleOnPlane(hit: Vector3, center: Vector3, axis: Axis): number {
  const d = Vector3.subtract(hit, center)
  // For each rotation axis, pick the two in-plane axes for atan2
  switch (axis) {
    case 'x': return Math.atan2(d.z, d.y)  // plane is YZ
    case 'y': return Math.atan2(d.x, d.z)  // plane is XZ
    case 'z': return Math.atan2(d.y, d.x)  // plane is XY
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

    console.log(
      `Drag start [move ${axis}]: pos=(${entityPos.x.toFixed(2)}, ${entityPos.y.toFixed(2)}, ${entityPos.z.toFixed(2)})`
    )
  } else {
    // Rotation: intersect with the plane perpendicular to the rotation axis through the gizmo center
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

    const euler = Quaternion.toEulerAngles(entityRot)
    console.log(
      `Drag start [rotate ${axis}]: rot=(${euler.x.toFixed(1)}, ${euler.y.toFixed(1)}, ${euler.z.toFixed(1)})`
    )
  }
}

function dragSystem(_dt: number) {
  if (!state.isDragging || state.selectedEntity === undefined || !Transform.has(state.selectedEntity))
    return

  // End drag on pointer release (global check — works even if cursor left the handle)
  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) {
    endDrag()
    return
  }
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) {
    endDrag()
    return
  }

  const pointer = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  if (!pointer || !pointer.worldRayDirection) return

  const cameraT = Transform.get(engine.CameraEntity)

  if (state.gizmoMode === 'translate') {
    // Use the plane normal locked at drag start — prevents jumps if camera rotates mid-drag
    const hit = rayPlaneIntersect(
      cameraT.position,
      pointer.worldRayDirection,
      state.dragStartPos,
      state.dragPlaneNormal
    )
    if (!hit) return

    // Project delta onto the drag axis
    const worldDelta = Vector3.subtract(hit, state.dragStartHit)
    const axisDir = axisToVector(state.dragAxis)
    const displacement = Vector3.dot(worldDelta, axisDir)

    // Apply — only move along the constrained axis
    const t = Transform.getMutable(state.selectedEntity)
    t.position.x = state.dragStartPos.x + (state.dragAxis === 'x' ? displacement : 0)
    t.position.y = state.dragStartPos.y + (state.dragAxis === 'y' ? displacement : 0)
    t.position.z = state.dragStartPos.z + (state.dragAxis === 'z' ? displacement : 0)
  } else {
    // Rotation: intersect ray with the rotation plane, compute angle delta
    const hit = rayPlaneIntersect(
      cameraT.position,
      pointer.worldRayDirection,
      state.dragRotCenter,
      state.dragPlaneNormal
    )
    if (!hit) return

    const currentAngle = hitAngleOnPlane(hit, state.dragRotCenter, state.dragAxis)
    const angleDelta = currentAngle - state.dragStartAngle
    const degrees = angleDelta * (180 / Math.PI)

    // Convert angle delta to degrees and build incremental rotation
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

  // Restore all gizmo visuals to default when drag ends
  if (state.gizmoMode === 'rotate') {
    for (const [h, d] of handleDiscMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      setDiscMaterial(d, a, false)
    }
  } else {
    for (const [h, parts] of handleArrowMap) {
      const a = handleAxisMap.get(h)
      if (!a) continue
      for (const p of parts) setArrowMaterial(p, a, false)
    }
  }

  if (state.selectedEntity !== undefined && Transform.has(state.selectedEntity)) {
    const t = Transform.get(state.selectedEntity)
    if (state.gizmoMode === 'translate') {
      console.log(
        `Drag end [move ${state.dragAxis}]: pos=(${t.position.x.toFixed(2)}, ${t.position.y.toFixed(2)}, ${t.position.z.toFixed(2)})`
      )
    } else {
      const euler = Quaternion.toEulerAngles(t.rotation)
      console.log(
        `Drag end [rotate ${state.dragAxis}]: rot=(${euler.x.toFixed(1)}, ${euler.y.toFixed(1)}, ${euler.z.toFixed(1)})`
      )
    }
  }
}

// ============================================================
// Mode Toggle — press E to switch between translate/rotate
// ============================================================

function modeToggleSystem() {
  // E key: toggle translate/rotate
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    if (state.isDragging) return

    state.gizmoMode = state.gizmoMode === 'translate' ? 'rotate' : 'translate'
    console.log(`Gizmo mode: ${state.gizmoMode}`)

    // Rebuild gizmo if an entity is selected
    if (state.selectedEntity !== undefined) {
      createGizmo()
    }
  }

  // F key: deselect
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    if (state.isDragging) return
    deselectEntity()
  }
}

// ============================================================
// Main
// ============================================================

/** Reset the gizmo click consumed flag each frame (runs last via low priority) */
function resetGizmoClickFlag() {
  if (gizmoClickConsumed) {
    setGizmoClickConsumed(false)
  }
}

export function main() {
  createSceneObjects()
  engine.addSystem(dragSystem)
  engine.addSystem(gizmoFollowSystem)
  engine.addSystem(modeToggleSystem)
  engine.addSystem(resetGizmoClickFlag, Number.MAX_SAFE_INTEGER) // run last
  setupUi()
  console.log('Gizmo v2 loaded — ray-plane drag. Click objects, E to toggle Move/Rotate, drag handles.')
}
