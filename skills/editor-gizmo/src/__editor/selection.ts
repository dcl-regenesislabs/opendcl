/** Select/deselect entities, highlight, collider management. */

import {
  Entity,
  Transform,
  MeshCollider,
  Material,
  MaterialTransparencyMode,
  GltfContainer,
  GltfNodeModifiers,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Color4, Color3 } from '@dcl/sdk/math'
import { state, selectableInfoMap, originalMaterials, isLockedByOther } from './state'
import { createGizmo, destroyGizmo } from './gizmo'
import { requestLock, requestUnlock } from './persistence'

const HIGHLIGHT_EMISSIVE = 0.6
const HIGHLIGHT_ALPHA = 0.35

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
  // GLB models: use GltfNodeModifiers with empty path to make all nodes semi-transparent
  if (GltfContainer.has(entity)) {
    GltfNodeModifiers.createOrReplace(entity, {
      modifiers: [{
        path: '',
        material: {
          material: {
            $case: 'pbr' as const,
            pbr: {
              albedoColor: Color4.create(1, 1, 1, HIGHLIGHT_ALPHA),
              transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
              metallic: 0.1,
              roughness: 0.5,
            }
          }
        }
      }]
    })
    return
  }

  // Primitives: override Material directly
  const m = originalMaterials.get(entity)
  if (!m) return
  Material.setPbrMaterial(entity, {
    albedoColor: Color4.create(m.r, m.g, m.b, HIGHLIGHT_ALPHA),
    emissiveColor: Color3.create(m.r * 0.4, m.g * 0.4, m.b * 0.4),
    emissiveIntensity: HIGHLIGHT_EMISSIVE,
    metallic: 0.1,
    roughness: 0.4,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
  })
}

function unhighlight(entity: Entity) {
  // GLB models: remove the modifier
  if (GltfContainer.has(entity) && GltfNodeModifiers.has(entity)) {
    GltfNodeModifiers.deleteFrom(entity)
    return
  }

  // Primitives: restore original material
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

  const info = selectableInfoMap.get(entity)
  if (!info) return

  // Check if entity is locked by another admin
  if (isLockedByOther(info.name, state.myAddress)) {
    console.log(`[editor] "${info.name}" is locked by another admin`)
    return
  }

  // Deselect previous
  if (state.selectedEntity !== undefined) {
    deselectEntity()
  }

  state.selectedEntity = entity
  state.selectedName = info.name
  highlight(entity)
  disableCollider(entity)
  createGizmo()
  requestLock(info.name)
  console.log(`[editor] selected: ${info.name}`)
}

export function deselectEntity() {
  if (state.selectedEntity === undefined) return

  const info = selectableInfoMap.get(state.selectedEntity)
  unhighlight(state.selectedEntity)
  restoreCollider(state.selectedEntity)
  destroyGizmo()
  if (info) requestUnlock(info.name)

  state.selectedEntity = undefined
  state.selectedName = ''
}
