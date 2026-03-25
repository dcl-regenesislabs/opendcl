---
name: lighting-environment
description: Dynamic lighting and environment in Decentraland scenes. LightSource (point and spot lights), shadows, SkyboxTime (day/night cycle), realm detection, and emissive materials for glow effects. Use when the user wants lights, shadows, skybox control, day-night cycle, or glowing materials. Do NOT use for PBR material properties like metallic/roughness (see advanced-rendering).
---

# Lighting and Environment in Decentraland

## Point Lights

Emit light in all directions from a position:

```typescript
import { engine, Transform, LightSource } from '@dcl/sdk/ecs'
import { Vector3, Color3 } from '@dcl/sdk/math'

const light = engine.addEntity()
Transform.create(light, { position: Vector3.create(8, 3, 8) })

LightSource.create(light, {
  type: LightSource.Type.Point({}),
  color: Color3.White(),
  intensity: 16000  // candela
})
```

### Colored Point Light

```typescript
LightSource.create(light, {
  type: LightSource.Type.Point({}),
  color: Color3.create(1, 0.5, 0),  // Warm orange
  intensity: 16000,
  range: 15  // Maximum distance in meters
})
```

## Spot Lights

Emit a cone of light in a direction:

```typescript
import { Quaternion } from '@dcl/sdk/math'

const spotlight = engine.addEntity()
Transform.create(spotlight, {
  position: Vector3.create(8, 4, 8),
  rotation: Quaternion.fromEulerDegrees(-90, 0, 0)  // Point downward
})

LightSource.create(spotlight, {
  type: LightSource.Type.Spot({ innerAngle: 25, outerAngle: 45 }),
  color: Color3.White(),
  intensity: 16000
})
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
  intensity: 800
})
```

Note: shadows are not available on point lights, only on spoit lights.

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

- Maximum **one active light per parcel** in the scene (16m x 16m). Scenes with multiple parcels can group lights close together.
- The renderer auto-culls lights based on quality settings and proximity
- Up to ~3 shadowed lights visible at once
- Intensity is in candela — visible distance grows roughly with `sqrt(intensity)`
- Depending on the player's quality settings, they may see as much as 10 lights rendered at the same time, or as little as 4. If the scene is trying to render more lights than this, only the closest ones to the player will be rendered.

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

For a visual glow without casting light on surroundings:

```typescript
import { engine, Material } from '@dcl/sdk/ecs'
import { Color4, Color3 } from '@dcl/sdk/math'

// Self-illuminated material (emissiveColor uses Color3, not Color4)
Material.setPbrMaterial(entity, {
  albedoColor: Color4.create(0, 0, 0, 1),
  emissiveColor: Color3.create(0, 1, 0),  // Green glow
  emissiveIntensity: 2.0
})
```

Note: emissive materials don't illuminate other surrounding entities, they just have a glow effect on them.

### Combining Emissive + LightSource

For an object that both glows visually and casts light:

```typescript
// Visual glow on the mesh
Material.setPbrMaterial(bulb, {
  emissiveColor: Color3.create(1, 0.9, 0.7),
  emissiveIntensity: 1.5
})

// Actual light emission
LightSource.create(bulb, {
  type: LightSource.Type.Point({}),
  color: Color3.create(1, 0.9, 0.7),
  intensity: 200,
  range: 10
})
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
  intensity: 800
})
```

Available shadow types:
- `PBLightSource_ShadowType.ST_NONE` — no shadows (cheapest)
- `PBLightSource_ShadowType.ST_HARD` — crisp shadows (medium cost)
- `PBLightSource_ShadowType.ST_SOFT` — smooth, blurred shadows (most expensive)

> **Need advanced material effects?** See the **advanced-rendering** skill for metallic, roughness, transparency, texture maps, texture tweens, and texture modes.

## Best Practices

- Stay within the **one light per parcel** budget
- Use emissive materials for decorative glow that doesn't need to illuminate surroundings
- Combine emissive materials with LightSource for realistic light fixtures (lamp = emissive mesh + point light)
- Use spot lights with shadows for dramatic effects (stage lighting, flashlights)
- Keep shadow count low (max ~3 sadow-casting lights visible) — disable `shadow` on lights that don't need it
- Set `range` on lights to limit their influence and save performance
- Use `SkyboxTime` for atmosphere — nighttime scenes with point lights create dramatic environments
