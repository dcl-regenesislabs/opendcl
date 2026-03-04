/** Editor version — used by the editor-gizmo skill to detect outdated files */
export const EDITOR_VERSION = '0.2.0'

import { Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

export type Axis = 'x' | 'y' | 'z'
export type GizmoMode = 'translate' | 'rotate'

/** Per-entity info computed during auto-discovery */
export interface SelectableInfo {
  name: string
  centerOffset: { x: number; y: number; z: number }
  boundsSize: { x: number; y: number; z: number }
  isModel: boolean
  colliderShape: 'box' | 'sphere' | 'cylinder'
  /** Whether we added a MeshCollider (vs it already existing) */
  addedCollider: boolean
  /** Original GltfContainer visible mesh collision mask (to restore on deselect) */
  originalVisibleMask?: number
  /** Original GltfContainer invisible mesh collision mask */
  originalInvisibleMask?: number
  /** GltfContainer src path (for models) */
  src?: string
  /** Mesh type (for primitives) */
  meshType?: 'box' | 'sphere' | 'cylinder'
}

export interface EditorState {
  selectedEntity: Entity | undefined
  selectedName: string
  gizmoMode: GizmoMode
  isDragging: boolean
  dragAxis: Axis

  // Translate drag
  dragStartPos: { x: number; y: number; z: number }
  dragStartHit: { x: number; y: number; z: number }
  dragPlaneNormal: { x: number; y: number; z: number }

  // Rotate drag
  dragStartRot: { x: number; y: number; z: number; w: number }
  dragStartAngle: number
  dragRotCenter: { x: number; y: number; z: number }

  // WebSocket connection
  wsConnected: boolean
  pendingChanges: number
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
  wsConnected: false,
  pendingChanges: 0,
}

// ---- Entity tracking ----

/** Entities created by the editor (gizmo, indicators, ground) — skipped by discovery */
export const editorEntities = new Set<Entity>()

/** Discovered scene entities → their info */
export const selectableInfoMap = new Map<Entity, SelectableInfo>()

/** Original material colors for primitive highlight/unhighlight */
export const originalMaterials = new Map<Entity, { r: number; g: number; b: number; a: number }>()

// ---- Gizmo entities ----

export const gizmoEntities: Entity[] = []

export let gizmoRoot: Entity | undefined
export function setGizmoRoot(e: Entity | undefined) { gizmoRoot = e }

export const selectionIndicatorEntities: Entity[] = []

export const handleAxisMap = new Map<Entity, Axis>()
export const handleDiscMap = new Map<Entity, Entity>()
export const handleArrowMap = new Map<Entity, Entity[]>()

// ---- Click consumption flag ----

export let gizmoClickConsumed = false
export function setGizmoClickConsumed(v: boolean) { gizmoClickConsumed = v }
