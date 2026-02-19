---
name: add-3d-models
description: Add 3D models (.glb/.gltf) to a Decentraland scene using GltfContainer. Covers loading models, positioning, scaling, colliders, and browsing the open-source 3D assets catalog for free CC0 models. Use when user wants to add models, import GLB files, or find free 3D assets.
---

# Adding 3D Models to Decentraland Scenes

## Loading a 3D Model

Use `GltfContainer` to load `.glb` or `.gltf` files:

```typescript
import { engine, Transform, GltfContainer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

const model = engine.addEntity()
Transform.create(model, {
  position: Vector3.create(8, 0, 8),
  rotation: Quaternion.fromEulerDegrees(0, 0, 0),
  scale: Vector3.create(1, 1, 1)
})
GltfContainer.create(model, {
  src: 'models/myModel.glb'
})
```

## File Organization

Place model files in a `models/` directory at the project root:
```
project/
├── models/
│   ├── building.glb
│   ├── tree.glb
│   └── furniture/
│       ├── chair.glb
│       └── table.glb
├── src/
│   └── index.ts
└── scene.json
```

## Colliders

### Using Model's Built-in Colliders
Models exported with collision meshes work automatically. Set the collision mask:
```typescript
GltfContainer.create(model, {
  src: 'models/building.glb',
  visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER,
  invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
})
```

### Adding Simple Colliders
For basic shapes, add `MeshCollider`:
```typescript
import { MeshCollider } from '@dcl/sdk/ecs'
MeshCollider.setBox(model) // Box collider
MeshCollider.setSphere(model) // Sphere collider
```

## Common Model Operations

### Scaling
```typescript
Transform.create(model, {
  position: Vector3.create(8, 0, 8),
  scale: Vector3.create(2, 2, 2) // 2x size
})
```

### Rotation
```typescript
Transform.create(model, {
  position: Vector3.create(8, 0, 8),
  rotation: Quaternion.fromEulerDegrees(0, 90, 0) // Rotate 90° on Y axis
})
```

### Parenting (Attach to Another Entity)
```typescript
const parent = engine.addEntity()
Transform.create(parent, { position: Vector3.create(8, 0, 8) })

const child = engine.addEntity()
Transform.create(child, {
  position: Vector3.create(0, 2, 0), // 2m above parent
  parent: parent
})
GltfContainer.create(child, { src: 'models/hat.glb' })
```

## Free 3D Models

For free CC0-licensed 3D models suitable for Decentraland, read the catalog at:
`{baseDir}/../../context/open-source-3d-assets.md`

This catalog contains 991+ models organized by themed collections (Cyberpunk, Medieval, MomusPark, etc.) with direct download URLs.

When the user asks for 3D models:
1. Read the open-source-3d-assets.md file
2. Suggest models that match their description
3. Show them how to download and add the model to their scene

## Model Best Practices

- Keep models under 50MB per file for good loading times
- Use `.glb` format (binary GLTF) — smaller than `.gltf`
- Optimize triangle count: aim for under 1,500 triangles per model for small props
- Use texture atlases when possible to reduce draw calls
- Models with embedded animations can be played with the `Animator` component
- Test model orientation — Decentraland uses Y-up coordinate system
- Materials in models should use PBR (physically-based rendering) for best results
