/** Editor message schemas — shared between server and client. */

import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const EditorMessages = {
  // Client → Server
  editorReady:   Schemas.Map({}),
  editorLock:    Schemas.Map({ entityName: Schemas.String }),
  editorCommit:  Schemas.Map({
    entityName: Schemas.String,
    px: Schemas.Float, py: Schemas.Float, pz: Schemas.Float,
    rx: Schemas.Float, ry: Schemas.Float, rz: Schemas.Float, rw: Schemas.Float,
    sx: Schemas.Float, sy: Schemas.Float, sz: Schemas.Float,
  }),
  editorUnlock:  Schemas.Map({ entityName: Schemas.String }),
  editorReset:   Schemas.Map({ entityName: Schemas.String }),

  // Server → Client
  editorEnable:  Schemas.Map({ admin: Schemas.Boolean, address: Schemas.String }),
  editorLocked:  Schemas.Map({ entityName: Schemas.String, lockedBy: Schemas.String }),
  editorUnlocked: Schemas.Map({ entityName: Schemas.String }),
  editorConfirm: Schemas.Map({
    entityName: Schemas.String,
    px: Schemas.Float, py: Schemas.Float, pz: Schemas.Float,
    rx: Schemas.Float, ry: Schemas.Float, rz: Schemas.Float, rw: Schemas.Float,
    sx: Schemas.Float, sy: Schemas.Float, sz: Schemas.Float,
  }),
}

/** Typed room instance — import in both server and client code. */
export const editorRoom = registerMessages(EditorMessages)
