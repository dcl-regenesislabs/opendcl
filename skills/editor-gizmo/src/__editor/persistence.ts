/** WebSocket persistence, override loading, entity update sending. */

import { engine, Entity, Transform, executeTask } from '@dcl/sdk/ecs'
import { getRealm } from '~system/Runtime'
import { state, selectableInfoMap } from './state'
import { round } from './math-utils'

// ============================================================
// WebSocket — auto-send changes to preview server
// ============================================================

let editorWs: WebSocket | null = null

export function sendEntityUpdate(entity: Entity) {
  if (!editorWs || editorWs.readyState !== WebSocket.OPEN) return
  if (!Transform.has(entity)) return

  const info = selectableInfoMap.get(entity)
  if (!info) return

  const t = Transform.get(entity)

  const msg = {
    type: 'editor-update',
    name: info.name,
    components: {
      Transform: {
        position: { x: round(t.position.x), y: round(t.position.y), z: round(t.position.z) },
        rotation: { x: round(t.rotation.x, 4), y: round(t.rotation.y, 4), z: round(t.rotation.z, 4), w: round(t.rotation.w, 4) },
        scale: { x: round(t.scale.x), y: round(t.scale.y), z: round(t.scale.z) },
      },
    },
  }

  editorWs.send(JSON.stringify(msg))
  state.pendingChanges++
}

export function connectEditorWs() {
  executeTask(async () => {
    try {
      const realm = await getRealm({})
      const baseUrl = realm.realmInfo?.baseUrl
      if (!baseUrl) {
        console.log('[editor] no realm baseUrl — running without persistence')
        return
      }

      const wsUrl = baseUrl.replace(/^http/, 'ws')
      console.log(`[editor] connecting to ${wsUrl}`)

      editorWs = new WebSocket(wsUrl)

      editorWs.onopen = () => {
        state.wsConnected = true
        console.log('[editor] ws connected')
      }

      editorWs.onclose = () => {
        state.wsConnected = false
        editorWs = null
      }

      editorWs.onerror = () => {
        // Error is followed by close
      }
    } catch (err) {
      console.log(`[editor] ws connect failed: ${err}`)
    }
  })
}

// ============================================================
// Override loading
// ============================================================

interface ComponentOverrides {
  Transform?: {
    position?: { x: number; y: number; z: number }
    rotation?: { x: number; y: number; z: number; w: number }
    scale?: { x: number; y: number; z: number }
  }
}
const pendingOverrides = new Map<string, ComponentOverrides>()

export function loadEditorOverrides() {
  executeTask(async () => {
    try {
      const realm = await getRealm({})
      const baseUrl = realm.realmInfo?.baseUrl
      if (!baseUrl) return

      const response = await fetch(`${baseUrl}/editor/changes`)
      if (!response.ok) return

      const text = await response.text()
      const data = JSON.parse(text) as Record<string, { components?: ComponentOverrides }>
      let count = 0
      for (const [name, entry] of Object.entries(data)) {
        if (entry.components) {
          pendingOverrides.set(name, entry.components)
          count++
        }
      }
      if (count > 0) {
        console.log(`[editor] loaded ${count} overrides from server`)
        for (const [entity] of selectableInfoMap) {
          applyOverrides(entity)
        }
      }
    } catch {
      // Server not reachable — no overrides to apply
    }
  })
}

export function applyOverrides(entity: Entity) {
  const info = selectableInfoMap.get(entity)
  if (!info) return
  const overrides = pendingOverrides.get(info.name)
  if (!overrides) return

  if (overrides.Transform && Transform.has(entity)) {
    const t = Transform.getMutable(entity)
    if (overrides.Transform.position) {
      t.position = overrides.Transform.position
    }
    if (overrides.Transform.rotation) {
      t.rotation = overrides.Transform.rotation
    }
    if (overrides.Transform.scale) {
      t.scale = overrides.Transform.scale
    }
  }

  pendingOverrides.delete(info.name)
}
