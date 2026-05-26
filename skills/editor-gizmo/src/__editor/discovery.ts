/** Auto-discovery of scene entities. */

import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  GltfContainer,
  Name,
  PointerEvents,
  PointerEventType,
  inputSystem,
  InputAction,
  ColliderLayer,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import {
  SelectableInfo,
  state,
  editorEntities,
  selectableInfoMap,
  originalMaterials,
  gizmoClickConsumed,
} from './state'
import { selectEntity } from './selection'


/** Built-in entities to never register */
export const SKIP_ENTITIES = new Set<Entity>()

/** Entity names to skip (case-insensitive). Add names here to prevent selection. */
const SKIP_NAMES = new Set(['ground', 'floor'])

type PointerEventsValue = ReturnType<typeof PointerEvents.get>
const originalPointerEvents = new Map<Entity, PointerEventsValue | null>()

function addEditorHover(entity: Entity, name: string) {
  const existing = PointerEvents.getMutableOrNull(entity)
  const entry = {
    eventType: PointerEventType.PET_DOWN,
    eventInfo: { button: InputAction.IA_POINTER, hoverText: `Select ${name}`, maxDistance: 100 },
  }
  if (existing) {
    existing.pointerEvents.push(entry)
  } else {
    PointerEvents.create(entity, { pointerEvents: [entry] })
  }
}

function getEntityName(entity: Entity): string {
  if (Name.has(entity)) {
    return Name.get(entity).value
  }
  if (GltfContainer.has(entity)) {
    const src = GltfContainer.get(entity).src
    const filename = src.split('/').pop() ?? src
    return filename.replace(/\.(glb|gltf)$/i, '')
  }
  if (MeshRenderer.has(entity)) {
    const mr = MeshRenderer.get(entity) as any
    const meshCase = mr?.mesh?.$case ?? 'mesh'
    return `${meshCase} #${entity}`
  }
  return `entity #${entity}`
}

function detectMeshType(entity: Entity): 'box' | 'sphere' | 'cylinder' {
  if (!MeshRenderer.has(entity)) return 'box'
  try {
    const mr = MeshRenderer.get(entity) as any
    const c = mr?.mesh?.$case
    if (c === 'sphere') return 'sphere'
    if (c === 'cylinder') return 'cylinder'
  } catch {}
  return 'box'
}

function estimateBounds(entity: Entity): { centerOffset: Vector3; boundsSize: Vector3; isModel: boolean } {
  const t = Transform.get(entity)
  const s = t.scale ?? Vector3.One()

  if (GltfContainer.has(entity)) {
    return {
      centerOffset: Vector3.create(0, Math.max(s.y * 0.5, 0.3), 0),
      boundsSize: Vector3.create(Math.max(s.x, 0.5), Math.max(s.y, 0.5), Math.max(s.z, 0.5)),
      isModel: true,
    }
  }

  return {
    centerOffset: Vector3.Zero(),
    boundsSize: Vector3.create(s.x, s.y, s.z),
    isModel: false,
  }
}

export function registerEntity(entity: Entity) {
  if (selectableInfoMap.has(entity)) return
  if (editorEntities.has(entity)) return
  if (SKIP_ENTITIES.has(entity)) return

  // Only declared entities (those with a Name) are editable. Dynamic
  // entities created at runtime via engine.addEntity() are intentionally
  // skipped — by convention they have no Name component.
  if (!Name.has(entity)) return

  const n = Name.get(entity).value.toLowerCase()
  if (SKIP_NAMES.has(n)) return

  const { centerOffset, boundsSize, isModel } = estimateBounds(entity)
  const name = getEntityName(entity)
  const colliderShape = isModel ? 'box' : detectMeshType(entity)

  const hadMeshCollider = MeshCollider.has(entity)
  if (!hadMeshCollider) {
    MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  }

  let originalVisibleMask: number | undefined
  let originalInvisibleMask: number | undefined
  if (GltfContainer.has(entity)) {
    const gltf = GltfContainer.get(entity)
    originalVisibleMask = gltf.visibleMeshesCollisionMask
    originalInvisibleMask = gltf.invisibleMeshesCollisionMask
  }

  if (!isModel && Material.has(entity)) {
    try {
      const mat = Material.get(entity) as any
      const pbr = mat?.pbr ?? mat?.material?.pbr
      if (pbr?.albedoColor) {
        const c = pbr.albedoColor
        originalMaterials.set(entity, { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0, a: c.a ?? 1 })
      }
    } catch {}
  }

  // Read parent entity from Transform
  let parentEntity: number | undefined
  const t = Transform.get(entity)
  const rawParent = t.parent
  if (rawParent !== undefined && rawParent !== 0 && rawParent !== (entity as number)) {
    parentEntity = rawParent as number
  }

  const info: SelectableInfo = {
    name,
    centerOffset,
    boundsSize,
    isModel,
    colliderShape,
    originalVisibleMask,
    originalInvisibleMask,
    src: GltfContainer.has(entity) ? GltfContainer.get(entity).src : undefined,
    meshType: !isModel ? colliderShape : undefined,
    parentEntity,
  }

  selectableInfoMap.set(entity, info)

  const snapshot = PointerEvents.getOrNull(entity)
  originalPointerEvents.set(entity, snapshot ? structuredClone(snapshot) : null)
  addEditorHover(entity, name)
}

export function discoverySystem() {
  if (!state.editorActive) return

  for (const [entity] of engine.getEntitiesWith(Transform, MeshRenderer)) {
    registerEntity(entity)
  }
  for (const [entity] of engine.getEntitiesWith(Transform, GltfContainer)) {
    registerEntity(entity)
  }
}

/** Polls pointer-down input per selectable entity. Runs only while editor is
 *  active so scene click handlers behave normally otherwise. */
export function editorClickSystem() {
  if (!state.editorActive || state.isDragging || gizmoClickConsumed) return
  for (const [entity] of selectableInfoMap) {
    if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN, entity)) {
      selectEntity(entity)
      return
    }
  }
}

/** Restore each discovered entity's PointerEvents to the snapshot taken at
 *  registration time. Called on editor-off so the scene's own click handlers
 *  see their unmodified component again. */
export function removeAllPointerEvents() {
  for (const [entity, original] of originalPointerEvents) {
    if (original === null) {
      PointerEvents.deleteFrom(entity)
    } else {
      PointerEvents.createOrReplace(entity, original)
    }
  }
}

/** Re-add the editor's hover affordance to each registered entity, leaving
 *  any user-added entries intact. Inverse of removeAllPointerEvents. */
export function restoreAllPointerEvents() {
  for (const [entity, info] of selectableInfoMap) {
    addEditorHover(entity, info.name)
  }
}
