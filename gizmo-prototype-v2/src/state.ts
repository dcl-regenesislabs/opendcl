import { Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

export type Axis = 'x' | 'y' | 'z'
export type GizmoMode = 'translate' | 'rotate'

/** Per-entity info used by gizmo and selection indicator */
export interface SelectableInfo {
  name: string
  /** Local offset from entity origin to visual center (for gizmo placement) */
  centerOffset: { x: number; y: number; z: number }
  /** Approximate bounding box size (for selection indicator) */
  boundsSize: { x: number; y: number; z: number }
  /** Whether this is a GLB model (can't change material for highlight) */
  isModel: boolean
  /** Collider shape to restore on deselect */
  colliderShape: 'box' | 'sphere' | 'cylinder'
}

export interface EditorState {
  selectedEntity: Entity | undefined
  selectedName: string
  gizmoMode: GizmoMode
  isDragging: boolean
  dragAxis: Axis

  // ---- Translate drag state ----
  /** World position of entity when drag started */
  dragStartPos: { x: number; y: number; z: number }
  /** World hit point on the drag plane when drag started */
  dragStartHit: { x: number; y: number; z: number }
  /** Plane normal locked at drag start (prevents jumps if camera rotates mid-drag) */
  dragPlaneNormal: { x: number; y: number; z: number }

  // ---- Rotate drag state ----
  /** Entity rotation when drag started */
  dragStartRot: { x: number; y: number; z: number; w: number }
  /** Angle (radians) from center to initial hit on the rotation plane */
  dragStartAngle: number
  /** Center point of the rotation gizmo (world space) */
  dragRotCenter: { x: number; y: number; z: number }
}

export const state: EditorState = {
  selectedEntity: undefined,
  selectedName: '',
  gizmoMode: 'translate',
  isDragging: false,
  dragAxis: 'x',
  dragStartPos: Vector3.Zero(),
  dragStartHit: Vector3.Zero(),
  dragPlaneNormal: Vector3.Up(),
  dragStartRot: Quaternion.Identity(),
  dragStartAngle: 0,
  dragRotCenter: Vector3.Zero(),
}

/** All gizmo entities — destroyed on deselect */
export const gizmoEntities: Entity[] = []

/** The root entity that positions the whole gizmo */
export let gizmoRoot: Entity | undefined

export function setGizmoRoot(e: Entity | undefined) {
  gizmoRoot = e
}

/** Selection indicator entities (wireframe edges) — destroyed on deselect */
export const selectionIndicatorEntities: Entity[] = []

/** Maps handle entity → axis */
export const handleAxisMap = new Map<Entity, Axis>()

/** Maps handle entity → its visible disc entity (for rotation hover highlight) */
export const handleDiscMap = new Map<Entity, Entity>()

/** Maps handle entity → its visible parts [shaft, tip] (for translate hover highlight) */
export const handleArrowMap = new Map<Entity, Entity[]>()

/** Per-entity metadata for gizmo placement and selection indicator */
export const selectableInfoMap = new Map<Entity, SelectableInfo>()

/** Original material colors for highlight/unhighlight (primitives only) */
export const originalMaterials = new Map<Entity, { r: number; g: number; b: number; a: number }>()

/**
 * Set to true when a gizmo handle is clicked in the current frame.
 * Prevents the same click from also triggering selection/deselection on the object behind it.
 * Reset each frame by a system.
 */
export let gizmoClickConsumed = false

export function setGizmoClickConsumed(v: boolean) {
  gizmoClickConsumed = v
}
