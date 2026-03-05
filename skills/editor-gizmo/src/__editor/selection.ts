/** Select/deselect entities, highlight, collider management. */

import {
  engine,
  Entity,
  Transform,
  MeshCollider,
  Material,
  GltfContainer,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Color4, Color3 } from '@dcl/sdk/math'
import { state, selectableInfoMap, originalMaterials } from './state'
import { createGizmo, destroyGizmo } from './gizmo'
import { createSelectionIndicator, destroySelectionIndicator } from './indicator'

const HIGHLIGHT_EMISSIVE = 0.6

function disableCollider(entity: Entity) {
  if (MeshCollider.has(entity)) {
    MeshCollider.deleteFrom(entity)
  }
  if (GltfContainer.has(entity)) {
    const gltf = GltfContainer.getMutable(entity)
    gltf.visibleMeshesCollisionMask = 0
    gltf.invisibleMeshesCollisionMask = 0
  }
}

function restoreCollider(entity: Entity) {
  const info = selectableInfoMap.get(entity)
  if (!info) return

  switch (info.colliderShape) {
    case 'box':
      MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
      break
    case 'sphere':
      MeshCollider.setSphere(entity, ColliderLayer.CL_POINTER)
      break
    case 'cylinder':
      MeshCollider.setCylinder(entity, undefined, undefined, ColliderLayer.CL_POINTER)
      break
  }

  if (GltfContainer.has(entity) && info.originalVisibleMask !== undefined) {
    const gltf = GltfContainer.getMutable(entity)
    gltf.visibleMeshesCollisionMask = info.originalVisibleMask
    gltf.invisibleMeshesCollisionMask = info.originalInvisibleMask ?? 0
  }
}

function highlight(entity: Entity) {
  const m = originalMaterials.get(entity)
  if (!m) return
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(m.r, m.g, m.b, m.a),
    emissiveColor: Color3.create(m.r * 0.4, m.g * 0.4, m.b * 0.4),
    emissiveIntensity: HIGHLIGHT_EMISSIVE,
    metallic: 0.1,
    roughness: 0.4,
  })
}

function unhighlight(entity: Entity) {
  const m = originalMaterials.get(entity)
  if (!m) return
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(m.r, m.g, m.b, m.a),
    metallic: 0.1,
    roughness: 0.5,
  })
}

export function selectEntity(entity: Entity) {
  if (state.selectedEntity === entity) {
    deselectEntity()
    return
  }

  if (state.selectedEntity !== undefined) {
    unhighlight(state.selectedEntity)
    restoreCollider(state.selectedEntity)
    destroyGizmo()
    destroySelectionIndicator()
  }

  const info = selectableInfoMap.get(entity)
  if (!info) return

  state.selectedEntity = entity
  state.selectedName = info.name
  highlight(entity)
  disableCollider(entity)
  createGizmo()
  createSelectionIndicator(entity, info)
  console.log(`Selected: ${info.name}`)
}

export function deselectEntity() {
  if (state.selectedEntity !== undefined) {
    unhighlight(state.selectedEntity)
    restoreCollider(state.selectedEntity)
    destroyGizmo()
    destroySelectionIndicator()
    state.selectedEntity = undefined
    state.selectedName = ''
  }
}
