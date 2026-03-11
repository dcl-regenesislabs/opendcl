---
name: optimize-scene
description: Optimize Decentraland scene performance. Scene limit formulas (triangles, entities, materials, textures, height per parcel count), object pooling, LOD patterns, texture optimization, system throttling, and asset preloading. Use when the user wants to optimize, improve performance, fix lag, reduce load time, check limits, or reduce entity/triangle count. Do NOT use for deployment (see deploy-scene).
---

# Optimizing Decentraland Scenes

## Scene Limits (Per Parcel Count)

All limits scale with parcel count `n`. Triangles, entities, and bodies scale linearly. Materials, textures, and height scale logarithmically.

| Resource | Formula | 1 parcel | 2 parcels | 4 parcels | 9 parcels | 16 parcels |
|---|---|---|---|---|---|---|
| **Triangles** | n x 10,000 | 10,000 | 20,000 | 40,000 | 90,000 | 160,000 |
| **Entities** | n x 200 | 200 | 400 | 800 | 1,800 | 3,200 |
| **Physics bodies** | n x 300 | 300 | 600 | 1,200 | 2,700 | 4,800 |
| **Materials** | log2(n+1) x 20 | 20 | 31 | 46 | 66 | 81 |
| **Textures** | log2(n+1) x 10 | 10 | 15 | 23 | 33 | 40 |
| **Height limit** | log2(n+1) x 20m | 20m | 31m | 46m | 66m | 81m |

**File limits:** 15 MB per parcel, 300 MB max total, 200 files per parcel, 50 MB max per individual file.

## Entity Count Optimization

### Reuse Entities
```typescript
// BAD: Creating new entity each time
function spawnBullet() {
  const bullet = engine.addEntity() // Creates entity every call
  // ...
}

// GOOD: Object pooling
const bulletPool: Entity[] = []
function getBullet(): Entity {
  const existing = bulletPool.find(e => !ActiveBullet.has(e))
  if (existing) return existing
  const newBullet = engine.addEntity()
  bulletPool.push(newBullet)
  return newBullet
}
```

### Remove Unused Entities
```typescript
engine.removeEntity(entity) // Frees the entity slot
```

### Use Parenting
Instead of separate transforms for each child, use entity hierarchy:
```typescript
const parent = engine.addEntity()
Transform.create(parent, { position: Vector3.create(8, 0, 8) })

// Children inherit parent transform
const child1 = engine.addEntity()
Transform.create(child1, { position: Vector3.create(0, 1, 0), parent })

const child2 = engine.addEntity()
Transform.create(child2, { position: Vector3.create(1, 1, 0), parent })
```

## Triangle Count Optimization

### Use Lower-Poly Models
- Small props: 100-500 triangles
- Medium objects: 500-1,500 triangles
- Large buildings: 1,500-5,000 triangles
- Hero pieces: Up to 10,000 triangles

### Use LOD (Level of Detail)
Show simpler models at distance:
```typescript
engine.addSystem(() => {
  // Check distance to player and swap models
  const playerPos = Transform.get(engine.PlayerEntity).position
  const objPos = Transform.get(myEntity).position
  const distance = Vector3.distance(playerPos, objPos)

  const gltf = GltfContainer.getMutable(myEntity)
  if (distance > 30) {
    gltf.src = 'models/building_lod2.glb' // Low poly
  } else if (distance > 15) {
    gltf.src = 'models/building_lod1.glb' // Medium poly
  } else {
    gltf.src = 'models/building_lod0.glb' // High poly
  }
})
```

### Use Primitives Instead of Models
For simple shapes, `MeshRenderer` is lighter than loading a .glb:
```typescript
MeshRenderer.setBox(entity)    // Very cheap
MeshRenderer.setSphere(entity) // Cheap
MeshRenderer.setPlane(entity)  // Very cheap
```

## Texture Optimization

- **Dimensions must be power-of-two**: 256, 512, 1024, 2048
- **Recommended sizes**: 512x512 for most objects, 1024x1024 max for hero pieces
- **Avoid textures over 2048x2048** — they consume excessive memory and often exceed limits
- Use `.png` for UI/sprites with transparency
- Use `.jpg` for photos and textures without transparency
- Prefer compressed formats (WebP) over raw PNG where possible
- Use texture atlases (combine multiple textures into one image) to reduce draw calls and material count
- Share texture references across materials — do not duplicate texture files
- Reuse materials across entities:
```typescript
// GOOD: Define material once, apply to many
Material.setPbrMaterial(entity1, { texture: Material.Texture.Common({ src: 'images/wall.jpg' }) })
Material.setPbrMaterial(entity2, { texture: Material.Texture.Common({ src: 'images/wall.jpg' }) })
// Same texture URL = shared in memory
```

## System Optimization

### Avoid Per-Frame Allocations
```typescript
// BAD: Creates new Vector3 every frame
engine.addSystem(() => {
  const target = Vector3.create(8, 1, 8) // Allocation!
})

// GOOD: Reuse constants
const TARGET = Vector3.create(8, 1, 8)
engine.addSystem(() => {
  // Use TARGET
})
```

### Throttle Expensive Operations
```typescript
let lastCheck = 0
engine.addSystem((dt) => {
  lastCheck += dt
  if (lastCheck < 0.5) return // Only run every 0.5 seconds
  lastCheck = 0
  // Expensive operation here
})
```

### Remove Systems When Not Needed
```typescript
const systemFn = (dt: number) => { /* ... */ }
engine.addSystem(systemFn)

// When no longer needed:
engine.removeSystem(systemFn)
```

## Asset Preloading (AssetLoad Component)

For large assets that would cause visible pop-in, use `AssetLoad` to pre-download before rendering:

```typescript
import { engine, AssetLoad, LoadingState, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// Create a preload entity at scene startup
const preloadEntity = engine.addEntity()
AssetLoad.create(preloadEntity, { src: 'models/large-model.glb' })

// System to track loading progress
function assetLoadingSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(AssetLoad)) {
    const state = AssetLoad.get(entity)
    if (state.loadingState === LoadingState.FINISHED) {
      // Asset is cached — now safe to create the visible entity
      GltfContainer.create(entity, { src: 'models/large-model.glb' })
      Transform.create(entity, { position: Vector3.create(8, 0, 8) })
      AssetLoad.deleteFrom(entity) // Remove preload component
    }
  }
}
engine.addSystem(assetLoadingSystem)
```

Use this pattern for any model over ~1 MB or for assets that should be ready before a game phase begins.

## Loading Time Optimization

- Lazy-load 3D models (load on demand, not all at scene start)
- Use compressed .glb files (Draco compression)
- Minimize total asset size
- Use CDN URLs for large shared assets when possible
- Preload critical assets with `AssetLoad`, defer non-essential ones

## Common Performance Pitfalls

1. **Too many systems**: Each system runs every frame. Combine related logic.
2. **Unnecessary component queries**: Cache `engine.getEntitiesWith()` results when the set doesn't change.
3. **Large GLTF files**: Optimize in Blender before export (decimate, remove hidden faces).
4. **Uncompressed audio**: Use .mp3 instead of .wav for music (10x smaller).
5. **Continuous raycasting**: Set `continuous: false` unless you need per-frame raycasting.
6. **Text rendering**: `TextShape` is expensive. Use `Label` (UI) for text that doesn't need to be in 3D space.

## Cross-References

- **add-3d-models** — model loading, colliders, and file organization
- **game-design** — performance budgets, design patterns, and MVP planning
- **advanced-rendering** — texture modes, material reuse, and LOD with VisibilityComponent
