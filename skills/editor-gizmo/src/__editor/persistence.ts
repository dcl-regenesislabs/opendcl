/**
 * Persistence — saves entity transforms to the preview server via HTTP.
 *
 *   POST {baseUrl}/editor/changes  → merge an entity update into main-entities.ts
 *   GET  {baseUrl}/editor/changes  → fetch the current main-entities.ts contents
 *
 * Replaces the previous auth-server message bus. The server (sdk-commands in
 * preview, opendcl-studio in web) is responsible for writing main-entities.ts on disk
 * and triggering main.crdt regeneration.
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

/** Names of entities declared in main-entities.ts — populated by initPersistence. */
const editableNames = new Set<string>()

/**
 * True once we've successfully fetched the set of editable names. Until then,
 * `isEditableName` falls back to permissive (returns true) so the hierarchy
 * isn't empty during local development before the server's /editor/changes
 * endpoint is reachable.
 */
let filterReady = false

/**
 * Initialize persistence: resolve baseUrl, fetch the current set of editable
 * entity names from main-entities.ts. Safe to call multiple times.
 */
export async function initPersistence(): Promise<void> {
  baseUrl = RealmInfo.getOrNull(engine.RootEntity)?.baseUrl ?? null
  if (!baseUrl) {
    console.log('[editor] no realm baseUrl — persistence disabled')
    return
  }

  try {
    const res = await fetch(`${baseUrl}/editor/changes`)
    if (!res.ok) return
    const data = (await res.json()) as ChangesMap
    editableNames.clear()
    for (const name of Object.keys(data)) editableNames.add(name)
    filterReady = true
    console.log(`[editor] loaded ${editableNames.size} editable entities from main-entities.ts`)
  } catch (e) {
    console.log(`[editor] failed to load main-entities.ts: ${e}`)
  }
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

  // Optimistically mark the name as editable (in case it was just added).
  editableNames.add(info.name)

  fetch(`${baseUrl}/editor/changes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((e) => console.log(`[editor] save failed: ${e}`))
}

/**
 * True if this entity name is declared in main-entities.ts (eligible for editing).
 * Until the server's /editor/changes endpoint responds, this returns true for
 * everything so the hierarchy isn't empty during local dev.
 */
export function isEditableName(name: string): boolean {
  if (!filterReady) return true
  return editableNames.has(name)
}
