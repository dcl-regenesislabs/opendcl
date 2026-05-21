/** Shared editor state — the single source of truth for all editor modules. */

import { Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

export const EDITOR_VERSION = '0.6.0'

export type Axis = 'x' | 'y' | 'z'
export type GizmoMode = 'translate' | 'rotate'

/** Maximum depth for parent chain walking (prevents infinite loops). */
export const MAX_PARENT_DEPTH = 16

// ── Per-entity info (populated by discovery) ────────────

export interface SelectableInfo {
  name: string
  centerOffset: { x: number; y: number; z: number }
  boundsSize: { x: number; y: number; z: number }
  isModel: boolean
  colliderShape: 'box' | 'sphere' | 'cylinder'
  originalVisibleMask?: number
  originalInvisibleMask?: number
  src?: string
  meshType?: 'box' | 'sphere' | 'cylinder'
  parentEntity?: number
}

// ── Editor state ────────────────────────────────────────

export interface EditorState {
  selectedEntity: Entity | undefined
  selectedName: string
  gizmoMode: GizmoMode
  isDragging: boolean
  dragAxis: Axis

  // Translate drag
  dragPlaneMode: Axis | undefined  // when set, drag on plane perpendicular to this axis
  dragStartPos: { x: number; y: number; z: number }
  dragStartWorldPos: { x: number; y: number; z: number }
  dragStartHit: { x: number; y: number; z: number }
  dragPlaneNormal: { x: number; y: number; z: number }

  // Rotate drag
  dragStartRot: { x: number; y: number; z: number; w: number }
  dragStartAngle: number
  dragRotCenter: { x: number; y: number; z: number }

  // Camera
  editorCamActive: boolean

  // Editor toggle (starts ON in preview)
  editorActive: boolean

  // Whether the scene is running in preview mode (set on init)
  isPreview: boolean
}

export const state: EditorState = {
  selectedEntity: undefined,
  selectedName: '',
  gizmoMode: 'translate',
  isDragging: false,
  dragPlaneMode: undefined,
  dragAxis: 'x',
  dragStartPos: Vector3.Zero(),
  dragStartWorldPos: Vector3.Zero(),
  dragStartHit: Vector3.Zero(),
  dragPlaneNormal: Vector3.Up(),
  dragStartRot: Quaternion.Identity(),
  dragStartAngle: 0,
  dragRotCenter: Vector3.Zero(),
  editorCamActive: false,
  editorActive: true,
  isPreview: false,
}

// ── Entity tracking ─────────────────────────────────────

/** Entities created by the editor (gizmo, ground plane) — skipped by discovery. */
export const editorEntities = new Set<Entity>()

/** Discovered scene entities → their info. */
export const selectableInfoMap = new Map<Entity, SelectableInfo>()

/** Original material colors for primitive highlight/unhighlight. */
export const originalMaterials = new Map<Entity, { r: number; g: number; b: number; a: number }>()

// ── Gizmo entities ──────────────────────────────────────

export const gizmoEntities: Entity[] = []

export let gizmoRoot: Entity | undefined
export function setGizmoRoot(e: Entity | undefined) { gizmoRoot = e }

export const handleAxisMap = new Map<Entity, Axis>()
export const handleDiscMap = new Map<Entity, Entity>()
export const handleArrowMap = new Map<Entity, Entity[]>()

// ── Editor toggle callback ──────────────────────────────

/** Set by index.ts to handle toggle cleanup (deselect, camera off, etc.) */
let _onToggle: (() => void) | undefined
export function setToggleHandler(fn: () => void) { _onToggle = fn }

/** Toggle the editor on/off. Safe to call from UI — no circular deps. */
export function toggleEditorActive() {
  if (!state.isPreview) return
  if (_onToggle) _onToggle()
  else state.editorActive = !state.editorActive
}

// ── Click consumption flag ──────────────────────────────

export let gizmoClickConsumed = false
export function setGizmoClickConsumed(v: boolean) { gizmoClickConsumed = v }
