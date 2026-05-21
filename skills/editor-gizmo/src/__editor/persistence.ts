/**
 * Persistence — saves entity transforms to the preview server via HTTP.
 *
 *   POST {baseUrl}/editor/changes  → merge an entity update into main-entities.ts
 *
 * The server (sdk-commands in preview, opendcl-studio in web) is responsible
 * for writing main-entities.ts on disk and triggering main.crdt regeneration.
 *
 * Uses `signedFetch` instead of plain `fetch` because opendcl-studio
 * auth-gates this endpoint (signer address must match the scene owner).
 * In the CLI preview server the endpoint is unauthenticated; the extra
 * AuthChain headers signedFetch sends are simply ignored there. So the
 * same call shape works in both contexts.
 */

import { Entity, Transform, engine, RealmInfo } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
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

// Resolve baseUrl lazily at each send. RealmInfo is populated by the
// runtime AFTER scene-module-load completes, so caching it once at
// init time was racing with module init and pinning `null` forever —
// the gizmo would work but every drag-end silently dropped the request.
export function initPersistence(): void {
  // Kept for symmetry with the editor's bootstrap call; no longer
  // resolves baseUrl up front (see comment above).
  const baseUrl = RealmInfo.getOrNull(engine.RootEntity)?.baseUrl
  console.log(`[editor] persistence ready (baseUrl=${baseUrl ?? 'unresolved'})`)
}

function resolveBaseUrl(): string | null {
  return RealmInfo.getOrNull(engine.RootEntity)?.baseUrl ?? null
}

/** Send the current transform of an entity to the server for persistence. */
export function sendEntityUpdate(entity: Entity) {
  const baseUrl = resolveBaseUrl()
  if (!baseUrl) {
    console.log('[editor] sendEntityUpdate: no realm baseUrl yet')
    return
  }
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

  const url = `${baseUrl}/editor/changes`
  const body = JSON.stringify(payload)

  // signedFetch refuses non-https URLs by design. In local dev the studio
  // serves http://localhost:3001 — fall back to plain fetch there. The
  // server-side auth gate is correspondingly relaxed when DEV=true: in
  // prod the editor-changes endpoint requires signedFetch + ownership.
  if (url.startsWith('http://')) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then((res) => {
        if (!res.ok) console.log(`[editor] save returned ${res.status}`)
      })
      .catch((e) => console.log(`[editor] save failed: ${e}`))
    return
  }

  signedFetch({
    url,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  })
    .then((res) => {
      // signedFetch does NOT reject on non-2xx — log status so silent
      // 401 (signer ≠ scene owner) or 400 (validation) is visible.
      if (res.status !== undefined && (res.status < 200 || res.status >= 300)) {
        console.log(`[editor] save returned ${res.status}: ${res.body ?? ''}`)
      }
    })
    .catch((e) => console.log(`[editor] save failed: ${e}`))
}
