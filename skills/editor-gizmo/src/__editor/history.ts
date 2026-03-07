/** Undo/redo history for transform changes. */

import { Entity, Transform } from '@dcl/sdk/ecs'
import { state, selectableInfoMap } from './state'
import { sendEntityUpdate } from './persistence'

export interface TransformSnapshot {
  x: number; y: number; z: number
  rx: number; ry: number; rz: number; rw: number
  sx: number; sy: number; sz: number
}

interface HistoryEntry {
  entity: Entity
  before: TransformSnapshot
  after: TransformSnapshot
}

const stack: HistoryEntry[] = []
let cursor = -1
const MAX_HISTORY = 50

export function captureTransform(entity: Entity): TransformSnapshot {
  const t = Transform.get(entity)
  return {
    x: t.position.x, y: t.position.y, z: t.position.z,
    rx: t.rotation.x, ry: t.rotation.y, rz: t.rotation.z, rw: t.rotation.w,
    sx: t.scale.x, sy: t.scale.y, sz: t.scale.z,
  }
}

function applySnapshot(entity: Entity, snap: TransformSnapshot) {
  if (!Transform.has(entity)) return
  const t = Transform.getMutable(entity)
  t.position.x = snap.x;  t.position.y = snap.y;  t.position.z = snap.z
  t.rotation.x = snap.rx; t.rotation.y = snap.ry; t.rotation.z = snap.rz; t.rotation.w = snap.rw
  t.scale.x = snap.sx;    t.scale.y = snap.sy;    t.scale.z = snap.sz
}

export function pushHistory(entity: Entity, before: TransformSnapshot, after: TransformSnapshot) {
  stack.length = cursor + 1
  stack.push({ entity, before, after })
  cursor = stack.length - 1
  if (stack.length > MAX_HISTORY) {
    stack.shift()
    cursor--
  }
}

export function undo(): boolean {
  if (cursor < 0) return false
  const entry = stack[cursor]

  // Only allow undo on the currently selected (locked) entity
  if (entry.entity !== state.selectedEntity) {
    console.log('[editor] undo skipped — entity not selected')
    return false
  }

  cursor--
  applySnapshot(entry.entity, entry.before)
  sendEntityUpdate(entry.entity)
  const info = selectableInfoMap.get(entry.entity)
  console.log(`[editor] undo ${info?.name ?? 'entity'}`)
  return true
}

export function redo(): boolean {
  if (cursor >= stack.length - 1) return false
  const next = stack[cursor + 1]

  // Only allow redo on the currently selected (locked) entity
  if (next.entity !== state.selectedEntity) {
    console.log('[editor] redo skipped — entity not selected')
    return false
  }

  cursor++
  applySnapshot(next.entity, next.after)
  sendEntityUpdate(next.entity)
  const info = selectableInfoMap.get(next.entity)
  console.log(`[editor] redo ${info?.name ?? 'entity'}`)
  return true
}

export function undoCount(): number { return cursor + 1 }
export function redoCount(): number { return stack.length - 1 - cursor }
