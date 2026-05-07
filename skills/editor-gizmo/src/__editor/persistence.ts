/**
 * Persistence — saves entity transforms to the preview server via HTTP.
 *
 *   POST {baseUrl}/editor/changes  → merge an entity update into main-entities.ts
 *
 * The server (sdk-commands in preview, opendcl-studio in web) is responsible
 * for writing main-entities.ts on disk and triggering main.crdt regeneration.
 */

import { Entity, Transform, engine, RealmInfo } from '@dcl/sdk/ecs'
import { selectableInfoMap } from './state'
import { round } from './math-utils'

interface TransformPayload {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  scale: { x: number; y: number; z: number }
}

interface ChangePayload {
  components: { Transform: TransformPayload }
}

type ChangesMap = Record<string, ChangePayload>

let baseUrl: string | null = null

/** Resolve the preview server's baseUrl. Safe to call multiple times. */
export function initPersistence(): void {
  baseUrl = RealmInfo.getOrNull(engine.RootEntity)?.baseUrl ?? null
  if (!baseUrl) console.log('[editor] no realm baseUrl — persistence disabled')
}

/** Send the current transform of an entity to the server for persistence. */
export function sendEntityUpdate(entity: Entity) {
  if (!baseUrl) return
  if (!Transform.has(entity)) return
  const info = selectableInfoMap.get(entity)
  if (!info) return

  const t = Transform.get(entity)
  const payload: ChangesMap = {
    [info.name]: {
      components: {
        Transform: {
          position: { x: round(t.position.x), y: round(t.position.y), z: round(t.position.z) },
          rotation: {
            x: round(t.rotation.x, 4),
            y: round(t.rotation.y, 4),
            z: round(t.rotation.z, 4),
            w: round(t.rotation.w, 4),
          },
          scale: { x: round(t.scale.x), y: round(t.scale.y), z: round(t.scale.z) },
        },
      },
    },
  }

  fetch(`${baseUrl}/editor/changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((e) => console.log(`[editor] save failed: ${e}`))
}
