/** Wireframe bounding box selection indicator. */

import { engine, Entity, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4, Color3 } from '@dcl/sdk/math'
import { SelectableInfo, editorEntities, selectionIndicatorEntities } from './state'

const EDGE_THICKNESS = 0.025
const EDGE_COLOR = Color4.create(1, 0.85, 0.1, 1)
const EDGE_EMISSIVE = Color3.create(1, 0.75, 0.0)
const EDGE_EMISSIVE_INTENSITY = 3.0
const INDICATOR_PADDING = 0.15

function createEdge(parent: Entity, pos: Vector3, scale: Vector3) {
  const edge = engine.addEntity()
  Transform.create(edge, { position: pos, scale, parent })
  MeshRenderer.setBox(edge)
  Material.setPbrMaterial(edge, {
    albedoColor: EDGE_COLOR,
    emissiveColor: EDGE_EMISSIVE,
    emissiveIntensity: EDGE_EMISSIVE_INTENSITY,
    metallic: 0,
    roughness: 1,
  })
  selectionIndicatorEntities.push(edge)
  editorEntities.add(edge)
}

export function createSelectionIndicator(entity: Entity, info: SelectableInfo) {
  destroySelectionIndicator()

  const anchor = engine.addEntity()
  Transform.create(anchor, {
    position: Vector3.create(info.centerOffset.x, info.centerOffset.y, info.centerOffset.z),
    parent: entity,
  })
  selectionIndicatorEntities.push(anchor)
  editorEntities.add(anchor)

  const hw = (info.boundsSize.x + INDICATOR_PADDING) / 2
  const hh = (info.boundsSize.y + INDICATOR_PADDING) / 2
  const hd = (info.boundsSize.z + INDICATOR_PADDING) / 2
  const t = EDGE_THICKNESS
  const sx = info.boundsSize.x + INDICATOR_PADDING
  const sy = info.boundsSize.y + INDICATOR_PADDING
  const sz = info.boundsSize.z + INDICATOR_PADDING

  createEdge(anchor, Vector3.create(0, +hh, +hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, +hh, -hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, -hh, +hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(0, -hh, -hd), Vector3.create(sx, t, t))
  createEdge(anchor, Vector3.create(+hw, 0, +hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(+hw, 0, -hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(-hw, 0, +hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(-hw, 0, -hd), Vector3.create(t, sy, t))
  createEdge(anchor, Vector3.create(+hw, +hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(+hw, -hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(-hw, +hh, 0), Vector3.create(t, t, sz))
  createEdge(anchor, Vector3.create(-hw, -hh, 0), Vector3.create(t, t, sz))
}

export function destroySelectionIndicator() {
  for (const e of selectionIndicatorEntities) {
    editorEntities.delete(e)
    engine.removeEntity(e)
  }
  selectionIndicatorEntities.length = 0
}
