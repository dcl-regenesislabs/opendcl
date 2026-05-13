---
name: lighting-environment
description: Dynamic lighting and environment in Decentraland scenes. LightSource (point and spot lights), shadows, SkyboxTime (day/night cycle), realm detection, and emissive materials for glow effects. Use when the user wants lights, shadows, skybox control, day-night cycle, or glowing materials. Do NOT use for PBR material properties like metallic/roughness (see advanced-rendering).
---

# Lighting and Environment in Decentraland

## Authoring split

`LightSource` is supported in `main-entities.ts` — declare the lamp's fixture model AND its light in the same entry. The user can drag the fixture in the editor and the light follows.

```typescript
// main-entities.ts
import type { Scene } from '@dcl/sdk/scene-types'

export const scene = {
  ceiling_lamp: {
    components: {
      Transform: { position: { x: 8, y: 3, z: 8 } },
      GltfContainer: { src: 'models/lamp.glb' },
      LightSource: {
        type: { $case: 'point', point: {} },
        color: { r: 1, g: 1, b: 1 },
        intensity: 16000
      }
    }
  }
} satisfies Scene
```

For purely decorative lights with no mesh, declare a Transform-only entity and skip `GltfContainer`. Toggling lights at runtime still happens in `src/index.ts` via `LightSource.getMutable(getEntityOrNullByName('ceiling_lamp'))`.

## Point Lights

Emit light in all directions from a position:

```typescript
// main-entities.ts entry
ambient_point: {
  components: {
    Transform: { position: { x: 8, y: 3, z: 8 } },
    LightSource: {
      type: { $case: 'point', point: {} },
      color: { r: 1, g: 1, b: 1 },
      intensity: 16000  // candela — point lights typically need 8000–32000 to be visible
    }
  }
}
```

### Colored Point Light

```typescript
LightSource.create(light, {
  type: LightSource.Type.Point({}),
  color: Color3.create(1, 0.5, 0),  // Warm orange
  intensity: 12000,
  range: 15  // Maximum distance in meters
})
```

## Spot Lights

Emit a cone of light in a direction. The cone's orientation comes from the entity's Transform rotation.

```typescript
// main-entities.ts
stage_spot: {
  components: {
    Transform: {
      position: { x: 8, y: 4, z: 8 },
      rotation: { x: -0.7071, y: 0, z: 0, w: 0.7071 }  // pitch -90° (down)
    },
    GltfContainer: { src: 'models/spotlight.glb' },
    LightSource: {
      type: { $case: 'spot', spot: { innerAngle: 25, outerAngle: 45 } },
      color: { r: 1, g: 1, b: 1 },
      intensity: 16000
    }
  }
}
```

- `innerAngle` — full-brightness cone angle (degrees)
- `outerAngle` — outer fade angle (degrees)
- The light direction follows the entity's forward vector (set via Transform rotation)

## Shadows

Enable shadows on point or spot lights:

```typescript
LightSource.create(spotlight, {
  type: LightSource.Type.Spot({ innerAngle: 25, outerAngle: 45 }),
  shadow: true,
  intensity: 16000
})
```

> Shadows are only available on **spot lights**, not point lights.

### Shadow Mask Textures (Gobos)

Project a pattern through the light:

```typescript
const maskedLight = LightSource.getMutable(spotlight)
maskedLight.shadowMaskTexture = Material.Texture.Common({
  src: 'assets/scene/images/lightmask1.png'
})
```

## Toggling Lights

```typescript
// Toggle on/off
const lightData = LightSource.getMutable(light)
lightData.active = !lightData.active
```

## Light Limits

- Maximum **one active light per parcel** (16m x 16m) — multi-parcel scenes can group lights close together when needed.
- The renderer auto-culls lights based on quality settings and proximity. Quality range allows **4–10 lights visible simultaneously**.
- Shadows are only available on spot lights; up to ~3 shadowed lights visible at once.
- Intensity is in candela. Practical visible range: point lights ~8000–32000, spot lights ~10000–24000. Values below ~1000 are usually invisible.
- Emissive materials **don't illuminate surrounding entities** — they only have a glow effect on themselves. Combine an emissive material with a `LightSource` for both.

## SkyboxTime (Day/Night Cycle)

### Fixed Time in scene.json

Set a permanent time of day without code:

```json
{
  "skyboxConfig": {
    "fixedTime": 36000
  }
}
```

Time values: 0 = midnight, 36000 = noon, 54000 = dusk, 72000 = midnight again.

### Read Current World Time

```typescript
import { getWorldTime } from '~system/Runtime'

executeTask(async () => {
  const time = await getWorldTime({})
  console.log('Seconds since midnight:', time.seconds)
})
```

### Change Time Dynamically

```typescript
import { engine, SkyboxTime } from '@dcl/sdk/ecs'

// Set time of day (must target root entity)
SkyboxTime.create(engine.RootEntity, { fixedTime: 36000 })  // Noon

// Change with transition direction (TransitionMode from the generated protobuf)
SkyboxTime.createOrReplace(engine.RootEntity, {
  fixedTime: 54000,  // Dusk
  transitionMode: 1  // TM_BACKWARD
})
```

### Day/Night Cycle System

```typescript
let currentTime = 36000
const CYCLE_SPEED = 100  // Time units per second

function dayNightCycle(dt: number) {
  currentTime = (currentTime + CYCLE_SPEED * dt) % 72000
  SkyboxTime.createOrReplace(engine.RootEntity, {
    fixedTime: currentTime
  })
}

engine.addSystem(dayNightCycle)
```

## Realm Info

Detect which realm (server) the player is connected to:

```typescript
import { getRealm } from '~system/Runtime'

executeTask(async () => {
  const realm = await getRealm({})
  console.log('Realm:', realm.realmInfo?.realmName)
  console.log('Network:', realm.realmInfo?.networkId)
  console.log('Base URL:', realm.realmInfo?.baseUrl)
})
```

## Emissive Materials (Glow Effects)

`Material` is supported in `main-entities.ts`, so a glow that doesn't need to cast light on surroundings can be declared inline:

```typescript
// main-entities.ts
glowing_orb: {
  components: {
    Transform: { position: { x: 8, y: 1, z: 8 } },
    MeshRenderer: { mesh: { $case: 'sphere', sphere: {} } },
    Material: {
      material: {
        $case: 'pbr',
        pbr: {
          albedoColor: { r: 0, g: 0, b: 0, a: 1 },
          emissiveColor: { r: 0, g: 1, b: 0 },
          emissiveIntensity: 2.0
        }
      }
    }
  }
}
```

### Combining Emissive + LightSource

A single entity can carry both — emissive glow on the material AND light emission.

```typescript
// main-entities.ts
bulb: {
  components: {
    Transform: { position: { x: 8, y: 3, z: 8 } },
    GltfContainer: { src: 'models/bulb.glb' },
    Material: {
      material: {
        $case: 'pbr',
        pbr: {
          emissiveColor: { r: 1, g: 0.9, b: 0.7 },
          emissiveIntensity: 1.5
        }
      }
    },
    LightSource: {
      type: { $case: 'point', point: {} },
      color: { r: 1, g: 0.9, b: 0.7 },
      intensity: 12000,
      range: 10
    }
  }
}
```

### Shadow Types

Control shadow quality per light. Shadow type is set inside the `Spot()` or `Point()` helper:

```typescript
import { LightSource, PBLightSource_ShadowType } from '@dcl/sdk/ecs'

// Spot light with soft shadows
LightSource.create(spotEntity, {
  type: LightSource.Type.Spot({
    innerAngle: 25,
    outerAngle: 45,
    shadow: PBLightSource_ShadowType.ST_SOFT
  }),
  shadow: true,
  intensity: 16000
})
```

Available shadow types:
- `PBLightSource_ShadowType.ST_NONE` — no shadows (cheapest)
- `PBLightSource_ShadowType.ST_HARD` — crisp shadows (medium cost)
- `PBLightSource_ShadowType.ST_SOFT` — smooth, blurred shadows (most expensive)

> **Need advanced material effects?** See the **advanced-rendering** skill for metallic, roughness, transparency, texture maps, and texture modes.

## Best Practices

- Stay within the **one light per parcel** budget — plan light placement around scene parcels
- Use emissive materials for decorative glow that doesn't need to illuminate surroundings
- Combine emissive materials with LightSource for realistic light fixtures (lamp = emissive mesh + point light)
- Use spot lights with shadows for dramatic effects (stage lighting, flashlights)
- Keep shadow count low (max ~3 visible) — disable `shadow` on lights that don't need it
- Set `range` on lights to limit their influence and save performance
- Use `SkyboxTime` for atmosphere — nighttime scenes with point lights create dramatic environments
