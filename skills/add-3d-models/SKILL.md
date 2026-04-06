---
name: add-3d-models
description: Add 3D models (.glb/.gltf) to a Decentraland scene using GltfContainer. Covers loading, positioning, scaling, colliders, parenting, and browsing 5,700+ free assets from the OpenDCL catalog. Use when the user wants to add models, import GLB files, find free 3D assets, or set up model colliders. Do NOT use for materials/textures (see advanced-rendering) or model animations (see animations-tweens).
---

# Adding 3D Models to Decentraland Scenes

## Loading a 3D Model

Use `GltfContainer` to load `.glb` or `.gltf` files:

```typescript
import { engine, Transform, GltfContainer, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

const model = engine.addEntity()
Transform.create(model, {
  position: Vector3.create(8, 0, 8),
  rotation: Quaternion.fromEulerDegrees(0, 0, 0),
  scale: Vector3.create(1, 1, 1)
})
GltfContainer.create(model, {
  src: 'models/myModel.glb',
  visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER
})
```

> **Always set `visibleMeshesCollisionMask`** when loading models. Catalog models don't include separate collider meshes — using the visible mesh as the collider ensures the model is solid and clickable.

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

## Free 3D Models — OpenDCL Catalog (5,700+ models)

The catalog file is at `{baseDir}/references/model-catalog.md`. Each line has this format:
```
slug | dims | tris | size | category/sub | description [tags] [anim: clips] | curl command | preview: thumbnail_url
```

### How to search

Search with one keyword at a time — try the most specific word first:
```bash
grep -i "zombie" {baseDir}/references/model-catalog.md
```

If no results, try synonyms, broader terms, or related words:
- "sofa" → "couch" → "seat" → "furniture"
- "car" → "vehicle" → "truck" → "van"
- "wall" → "fence" → "barrier" → "structure"

Browse all categories to discover what's available:
```bash
grep "^##" {baseDir}/references/model-catalog.md
```

Search within a specific category:
```bash
grep "^##\|chair" {baseDir}/references/model-catalog.md
```

### How to use models

1. Search the catalog with different keywords until you find matching models
2. Review the results — check dimensions, triangle count, animations, and description
3. Download the model with the curl command into `models/`
4. Reference in code with `GltfContainer.create(entity, { src: 'models/{slug}.glb' })`
5. If the model has animations (listed in `[anim: ...]`), use the `Animator` component to play them
6. After placing the model, you can fetch its **preview thumbnail** (`preview:` URL) to see what it looks like

### Example workflow
```bash
# Search for zombie models
grep -i "zombie" {baseDir}/references/model-catalog.md

# Found: zombie-purple | 2.8×2.9×0.5m | 1472 tri | 271KB | character/zombie | ...
#   [anim: Tpose, ZombieAttack, ZombieUP, ZombieWalk]
#   preview: https://models.dclregenesislabs.xyz/blobs/bafkrei...

# Download the model
curl -o models/zombie-purple.glb "https://models.dclregenesislabs.xyz/blobs/bafybeiffc..."
```

```typescript
// Use in code with animations
import { engine, Transform, GltfContainer, Animator } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const zombie = engine.addEntity()
Transform.create(zombie, { position: Vector3.create(8, 0, 8) })
GltfContainer.create(zombie, { src: 'models/zombie-purple.glb' })
Animator.create(zombie, {
  states: [
    { clip: 'ZombieWalk', playing: true, loop: true },
    { clip: 'ZombieAttack', playing: false, loop: false }
  ]
})
```

> **Important**: `GltfContainer` only works with **local files**. Never use external URLs for the model `src` field. Always download models into `models/` first.
> **Never `cd` into the models directory**. Always run curl from the project root with `curl -o models/slug.glb "URL"`. Do NOT use `cd models && curl -o slug.glb`.

### Checking Model Load State

Use `GltfContainerLoadingState` to check if a model has finished loading:

```typescript
import { GltfContainer, GltfContainerLoadingState, LoadingState } from '@dcl/sdk/ecs'

engine.addSystem(() => {
  const state = GltfContainerLoadingState.getOrNull(modelEntity)
  if (state && state.currentState === LoadingState.FINISHED) {
    console.log('Model loaded successfully')
  } else if (state && state.currentState === LoadingState.FINISHED_WITH_ERROR) {
    console.log('Model failed to load')
  }
})
```

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Model not visible | Wrong file path | Verify the file exists at the exact path relative to project root (e.g., `models/myModel.glb`) |
| Model not visible | Position outside scene boundaries | Check Transform position is within 0-16 per parcel. Center of 1-parcel scene is (8, 0, 8) |
| Model not visible | Scale is 0 or very small | Check `Transform.scale` — default is (1,1,1). Try larger values if model was exported very small |
| Model not visible | Behind the camera | Move the avatar or rotate to look in the model's direction |
| Model loads but looks wrong | Y-up vs Z-up mismatch | Decentraland uses Y-up. Re-export from Blender with "Y Up" checked |
| "FINISHED_WITH_ERROR" load state | Corrupted or unsupported .glb | Re-export the model. Use `.glb` (binary GLTF) format. Ensure no unsupported extensions |
| Clicking model does nothing | Missing collider | Add `visibleMeshesCollisionMask: ColliderLayer.CL_POINTER` to `GltfContainer` or add `MeshCollider` |

> **Need to optimize models for scene limits?** See the **optimize-scene** skill for triangle budgets and LOD patterns.
> **Need animations from your model?** See the **animations-tweens** skill for playing GLTF animation clips with Animator.

## Model Best Practices

- Keep models under 50MB per file for good loading times
- Use `.glb` format (binary GLTF) — smaller than `.gltf`
- Optimize triangle count: aim for under 1,500 triangles per model for small props
- Use texture atlases when possible to reduce draw calls
- Models with embedded animations can be played with the `Animator` component
- Test model orientation — Decentraland uses Y-up coordinate system
- Materials in models should use PBR (physically-based rendering) for best results
