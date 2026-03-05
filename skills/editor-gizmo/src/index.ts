/**
 * Test scene for the __editor module.
 * This demonstrates how enableEditor() works with any scene.
 * The editor auto-discovers all entities — no manual registration needed.
 * Name components provide stable identifiers for save/load persistence.
 */

import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  GltfContainer,
  Name,
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { enableEditor } from './__editor'

function createSceneObjects() {
  // Ground
  const ground = engine.addEntity()
  Name.create(ground, { value: 'ground' })
  Transform.create(ground, {
    position: Vector3.create(16, 0, 16),
    scale: Vector3.create(32, 0.1, 32),
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, {
    albedoColor: Color4.create(0.25, 0.25, 0.28, 1),
    metallic: 0,
    roughness: 0.9,
  })

  // === 4 model-based groups with parent-child relationships ===

  // 1. Campfire area — bonfire parent with barrel + bench children
  const bonfire = engine.addEntity()
  Name.create(bonfire, { value: 'bonfire' })
  Transform.create(bonfire, { position: Vector3.create(8, 0, 10) })
  GltfContainer.create(bonfire, { src: 'models/Bonfire.glb' })

  const barrel = engine.addEntity()
  Name.create(barrel, { value: 'camp_barrel' })
  Transform.create(barrel, { position: Vector3.create(2.5, 0, 0), parent: bonfire })
  GltfContainer.create(barrel, { src: 'models/Barrel.glb' })

  const bench = engine.addEntity()
  Name.create(bench, { value: 'camp_bench' })
  Transform.create(bench, {
    position: Vector3.create(-2, 0, 1),
    rotation: Quaternion.fromEulerDegrees(0, 90, 0),
    parent: bonfire,
  })
  GltfContainer.create(bench, { src: 'models/Steampunk_Bench.glb' })

  // 2. Living room — armchair parent with lamp + TV children
  const armchair = engine.addEntity()
  Name.create(armchair, { value: 'armchair' })
  Transform.create(armchair, { position: Vector3.create(24, 0, 10) })
  GltfContainer.create(armchair, { src: 'models/Armchair_C.glb' })

  const lamp = engine.addEntity()
  Name.create(lamp, { value: 'room_lamp' })
  Transform.create(lamp, { position: Vector3.create(1.5, 0, 0), parent: armchair })
  GltfContainer.create(lamp, { src: 'models/Lamp.glb' })

  const tv = engine.addEntity()
  Name.create(tv, { value: 'room_tv' })
  Transform.create(tv, {
    position: Vector3.create(0, 0, 2.5),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    parent: armchair,
  })
  GltfContainer.create(tv, { src: 'models/Old_TV.glb' })

  // 3. Forest corner — tree parent with mushroom + rock children
  const tree = engine.addEntity()
  Name.create(tree, { value: 'tree' })
  Transform.create(tree, { position: Vector3.create(8, 0, 24), scale: Vector3.create(0.3, 0.3, 0.3) })

  const mushroom = engine.addEntity()
  Name.create(mushroom, { value: 'forest_mushroom' })
  Transform.create(mushroom, { position: Vector3.create(6, 0, 1), scale: Vector3.create(0.3, 0.3, 0.3), parent: tree })
  GltfContainer.create(mushroom, { src: 'models/Mushroom.glb' })

  const rock = engine.addEntity()
  Name.create(rock, { value: 'forest_rock' })
  Transform.create(rock, { position: Vector3.create(-4, 0, 3), scale: Vector3.create(0.15, 0.15, 0.15), parent: tree })
  GltfContainer.create(rock, { src: 'models/Rock.glb' })

  // 4. Treasure spot — chest parent with torch + cart (3 levels: cart > torch)
  const chest = engine.addEntity()
  Name.create(chest, { value: 'treasure_chest' })
  Transform.create(chest, { position: Vector3.create(24, 0, 24) })
  GltfContainer.create(chest, { src: 'models/Fantasy_Chest.glb' })

  const cart = engine.addEntity()
  Name.create(cart, { value: 'treasure_cart' })
  Transform.create(cart, {
    position: Vector3.create(3, 0, 0),
    rotation: Quaternion.fromEulerDegrees(0, -30, 0),
    parent: chest,
  })
  GltfContainer.create(cart, { src: 'models/Mines_Cart.glb' })

  const torch = engine.addEntity()
  Name.create(torch, { value: 'cart_torch' })
  Transform.create(torch, { position: Vector3.create(0, 1, 0), parent: cart })
  GltfContainer.create(torch, { src: 'models/Torch.glb' })
}

export function main() {
  createSceneObjects()
  enableEditor()
}
