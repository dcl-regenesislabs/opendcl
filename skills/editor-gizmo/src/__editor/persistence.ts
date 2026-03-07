/**
 * Persistence — sends commits/locks/resets to the auth-server via messages.
 */

import { Entity, Transform } from '@dcl/sdk/ecs'
import { selectableInfoMap } from './state'
import { round } from './math-utils'
import { editorRoom } from './messages'

/** Send the current transform of an entity to the server for persistence. */
export function sendEntityUpdate(entity: Entity) {
  if (!Transform.has(entity)) return
  const info = selectableInfoMap.get(entity)
  if (!info) return

  const t = Transform.get(entity)
  editorRoom.send('editorCommit', {
    entityName: info.name,
    px: round(t.position.x), py: round(t.position.y), pz: round(t.position.z),
    rx: round(t.rotation.x, 4), ry: round(t.rotation.y, 4), rz: round(t.rotation.z, 4), rw: round(t.rotation.w, 4),
    sx: round(t.scale.x), sy: round(t.scale.y), sz: round(t.scale.z),
  })
}

/** Request a lock on an entity. */
export function requestLock(entityName: string) {
  editorRoom.send('editorLock', { entityName })
}

/** Release a lock on an entity. */
export function requestUnlock(entityName: string) {
  editorRoom.send('editorUnlock', { entityName })
}

/** Request the server to reset an entity to its code-defined transform. */
export function requestReset(entityName: string) {
  editorRoom.send('editorReset', { entityName })
}
