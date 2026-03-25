import { engine, Transform, MeshRenderer, MeshCollider, Material, Name, GltfContainer } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { enableEditor } from './__editor'

export function main() {
  // Ground plane
  const ground = engine.addEntity()
  Name.create(ground, { value: 'ground' })
  Transform.create(ground, { position: Vector3.create(8, 0, 8), scale: Vector3.create(16, 0.1, 16) })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: Color4.create(0.2, 0.6, 0.2, 1) })

  // A simple cube to get started
  const cube = engine.addEntity()
  Name.create(cube, { value: 'cube_1' })
  Transform.create(cube, { position: Vector3.create(8, 1, 8) })
  MeshRenderer.setBox(cube)
  MeshCollider.setBox(cube)
  Material.setPbrMaterial(cube, { albedoColor: Color4.Red() })

  // Wooden door
  const door = engine.addEntity()
  Name.create(door, { value: 'wooden_door' })
  Transform.create(door, { position: Vector3.create(10, 0, 8) })
  GltfContainer.create(door, { src: 'models/Door_Wood_01/Door_Wood_01.glb' })

  // Enable the visual editor (click objects to select, drag to move/rotate)
  enableEditor()
}
