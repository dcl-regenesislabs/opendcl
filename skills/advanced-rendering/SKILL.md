---
name: advanced-rendering
description: Advanced rendering in Decentraland scenes. Billboard (face camera), TextShape (3D world text), PBR materials (metallic, roughness, transparency, emissive glow), GltfNodeModifiers (per-node shadow/material overrides), VisibilityComponent (show/hide entities), and texture modes. Use when the user wants billboards, floating labels, 3D text, material effects, glow, transparency, or model node control. Do NOT use for screen-space UI (see build-ui) or loading 3D models (see add-3d-models).
---

# Advanced Rendering in Decentraland

## When to Use Which Rendering Feature

| Need | Component | When |
|------|-----------|------|
| Entity faces the camera | `Billboard` | Name tags, signs, sprite-like objects |
| Text in the 3D world | `TextShape` | Labels, signs, floating text above entities |
| Custom material appearance | `Material.setPbrMaterial` | Metallic, rough, transparent, emissive surfaces |
| Show/hide without removing | `VisibilityComponent` | LOD systems, toggling objects, conditional display |
| Modify GLTF model nodes | `GltfNodeModifiers` | Override materials or shadow casting on specific mesh nodes |

**Decision flow:**
1. Need text on screen? → Use **build-ui** (React-ECS Label) instead
2. Need text in 3D space? → `TextShape` (+ `Billboard` to face camera)
3. Need glowing/transparent materials? → `Material.setPbrMaterial` with emissive/transparency
4. Need to override material on a model node? → `GltfNodeModifiers` with `modifiers` array

## Billboard (Face the Camera)

Make entities always rotate to face the player's camera:

```typescript
import { engine, Transform, Billboard, BillboardMode, MeshRenderer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const sign = engine.addEntity()
Transform.create(sign, { position: Vector3.create(8, 2, 8) })
MeshRenderer.setPlane(sign)

// Rotate only on Y axis (most common — stays upright)
Billboard.create(sign, {
  billboardMode: BillboardMode.BM_Y
})
```

### Billboard Modes

```typescript
BillboardMode.BM_Y      // Rotate on Y axis only (stays upright) — most common
BillboardMode.BM_ALL    // Rotate on all axes (fully faces camera)
BillboardMode.BM_X      // Rotate on X axis only
BillboardMode.BM_Z      // Rotate on Z axis only
BillboardMode.BM_NONE   // No billboard rotation
```

- Prefer `BM_Y` over `BM_ALL` for most use cases — it looks more natural and is cheaper to render.
- `BM_ALL` is useful for particles or effects that should always directly face the camera.

## TextShape (3D Text)

Render text directly in 3D space:

```typescript
import { engine, Transform, TextShape, TextAlignMode } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

const label = engine.addEntity()
Transform.create(label, { position: Vector3.create(8, 3, 8) })

TextShape.create(label, {
  text: 'Hello World!',
  fontSize: 24,
  textColor: Color4.White(),
  outlineColor: Color4.Black(),
  outlineWidth: 0.1,
  textAlign: TextAlignMode.TAM_MIDDLE_CENTER
})
```

### Text Alignment Options

```typescript
TextAlignMode.TAM_TOP_LEFT
TextAlignMode.TAM_TOP_CENTER
TextAlignMode.TAM_TOP_RIGHT
TextAlignMode.TAM_MIDDLE_LEFT
TextAlignMode.TAM_MIDDLE_CENTER
TextAlignMode.TAM_MIDDLE_RIGHT
TextAlignMode.TAM_BOTTOM_LEFT
TextAlignMode.TAM_BOTTOM_CENTER
TextAlignMode.TAM_BOTTOM_RIGHT
```

### Floating Label (Billboard + TextShape)

Combine Billboard and TextShape to create labels that always face the player:

```typescript
const floatingLabel = engine.addEntity()
Transform.create(floatingLabel, { position: Vector3.create(8, 4, 8) })

TextShape.create(floatingLabel, {
  text: 'NPC Name',
  fontSize: 16,
  textColor: Color4.White(),
  outlineColor: Color4.Black(),
  outlineWidth: 0.08,
  textAlign: TextAlignMode.TAM_BOTTOM_CENTER
})

Billboard.create(floatingLabel, {
  billboardMode: BillboardMode.BM_Y
})
```

## Advanced PBR Materials

### Metallic and Roughness

```typescript
import { engine, Transform, MeshRenderer, Material, MaterialTransparencyMode } from '@dcl/sdk/ecs'
import { Color4, Color3 } from '@dcl/sdk/math'

// Shiny metal
Material.setPbrMaterial(entity, {
  albedoColor: Color4.create(0.8, 0.8, 0.9, 1),
  metallic: 1.0,
  roughness: 0.1
})

// Rough stone
Material.setPbrMaterial(entity, {
  albedoColor: Color4.create(0.5, 0.5, 0.5, 1),
  metallic: 0.0,
  roughness: 0.9
})
```

### Transparency

```typescript
// Alpha blend — smooth transparency
Material.setPbrMaterial(entity, {
  albedoColor: Color4.create(1, 0, 0, 0.5), // 50% transparent red
  transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
})

// Alpha test — cutout (binary visible/invisible based on threshold)
Material.setPbrMaterial(entity, {
  texture: Material.Texture.Common({ src: 'assets/cutout.png' }),
  transparencyMode: MaterialTransparencyMode.MTM_ALPHA_TEST,
  alphaTest: 0.5
})
```

### Emissive (Glow Effects)

```typescript
// Glowing material (emissiveColor uses Color3, not Color4)
Material.setPbrMaterial(entity, {
  albedoColor: Color4.create(0, 0, 0, 1),
  emissiveColor: Color3.create(0, 1, 0),  // Green glow
  emissiveIntensity: 2.0
})

// Emissive with texture
Material.setPbrMaterial(entity, {
  texture: Material.Texture.Common({ src: 'assets/diffuse.png' }),
  emissiveTexture: Material.Texture.Common({ src: 'assets/emissive.png' }),
  emissiveIntensity: 1.0,
  emissiveColor: Color3.White()
})
```

### Texture Maps

```typescript
Material.setPbrMaterial(entity, {
  texture: Material.Texture.Common({ src: 'assets/diffuse.png' }),
  bumpTexture: Material.Texture.Common({ src: 'assets/normal.png' }),
  emissiveTexture: Material.Texture.Common({ src: 'assets/emissive.png' })
})
```

## GltfContainer Visibility Masks

Control visibility and collision of specific mesh layers within a GLTF model using collision masks:

```typescript
import { engine, Transform, GltfContainer, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const model = engine.addEntity()
Transform.create(model, { position: Vector3.create(4, 0, 4) })

GltfContainer.create(model, {
  src: 'models/myModel.glb',
  visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER,
  invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
})
```

## VisibilityComponent

Show or hide entities without removing them:

```typescript
import { engine, VisibilityComponent } from '@dcl/sdk/ecs'

// Hide an entity
VisibilityComponent.create(entity, { visible: false })

// Toggle visibility
const visibility = VisibilityComponent.getMutable(entity)
visibility.visible = !visibility.visible

// Useful for LOD (Level of Detail)
function lodSystem() {
  const playerPos = Transform.get(engine.PlayerEntity).position

  for (const [entity, transform] of engine.getEntitiesWith(Transform, MeshRenderer)) {
    const distance = Vector3.distance(playerPos, transform.position)

    if (distance > 30) {
      VisibilityComponent.createOrReplace(entity, { visible: false })
    } else {
      VisibilityComponent.createOrReplace(entity, { visible: true })
    }
  }
}

engine.addSystem(lodSystem)
```

### Per-Node Modifiers (GltfNodeModifiers)

Override material or shadow casting on specific nodes within a GLTF model:

```typescript
import { GltfNodeModifiers } from '@dcl/sdk/ecs'

GltfNodeModifiers.create(entity, {
  modifiers: [
    {
      path: 'RootNode/Armor',     // GLTF hierarchy path
      castShadows: false           // Disable shadow casting for this node
    }
  ]
})
```

### Avatar Texture

Generate a texture from a player's avatar:

```typescript
Material.setPbrMaterial(portraitFrame, {
  texture: Material.Texture.Avatar({ userId: '0x...' })
})
```

### Texture Modes

Control how textures are filtered and wrapped:

```typescript
import { TextureFilterMode, TextureWrapMode } from '@dcl/sdk/ecs'

Material.setPbrMaterial(entity, {
  texture: Material.Texture.Common({
    src: 'images/pixel-art.png',
    filterMode: TextureFilterMode.TFM_POINT,    // crisp pixels (no smoothing)
    wrapMode: TextureWrapMode.TWM_REPEAT        // tile the texture
  })
})
```

Filter modes: `TFM_POINT` (pixelated), `TFM_BILINEAR` (smooth), `TFM_TRILINEAR` (smoothest).
Wrap modes: `TWM_REPEAT` (tile), `TWM_CLAMP` (stretch edges), `TWM_MIRROR` (mirror tile).

## Best Practices

- Use `BillboardMode.BM_Y` instead of `BM_ALL` — looks more natural and renders faster
- Keep `fontSize` readable (16-32 for in-world text)
- Add `outlineColor` and `outlineWidth` to TextShape for legibility against any background
- Use `emissiveColor` with a dark `albedoColor` for maximum glow visibility
- `MTM_ALPHA_TEST` is cheaper than `MTM_ALPHA_BLEND` — use cutout when smooth transparency isn't needed
- Combine Billboard + TextShape for floating name labels above NPCs or objects
- Use VisibilityComponent for LOD systems instead of removing/re-adding entities
