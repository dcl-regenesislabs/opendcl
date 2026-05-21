---
name: particle-system
description: Emit particles (fire, smoke, sparks, snow, magic, fireworks) from an entity in a Decentraland SDK7 scene with the ParticleSystem component. Covers emitter shapes (Point, Sphere, Cone, Box), continuous rate vs Burst emission, lifetime/size/color/velocity ranges, gravity and additionalForce, blend modes (ALPHA/ADD/MULTIPLY), billboard and faceTravelDirection, sprite-sheet texture animation, simulation space (local vs world), playback state, and per-scene particle budget. Use when the user asks for particles, sparks, fire, smoke, dust, fog, fireworks, magic effects, snowfall, rain, embers, trails, or atmospheric effects. Do NOT use for procedural entity motion (see animations-tweens), GLTF model effects (see add-3d-models), or 2D UI effects (see build-ui).
---

# ParticleSystem (SDK7)

Emit particles from an entity. One `ParticleSystem` component per entity, attached alongside a `Transform`. No mesh required — particles render from the component itself.

## Authoring split

The emitter **position** (entity Transform + optional GltfContainer of a torch/fire pit/fog vent) is static and belongs in `main-entities.ts`. `ParticleSystem` itself is **not** in the supported declarative list — attach it at runtime in `src/index.ts` via `getEntityOrNullByName`.

```typescript
// main-entities.ts — emitter placement
campfire: {
  components: {
    Transform: { position: { x: 8, y: 0, z: 8 } },
    GltfContainer: { src: 'models/campfire.glb' }
  }
}
```

```typescript
// src/index.ts — attach ParticleSystem
import { engine, ParticleSystem, PBParticleSystem_BlendMode } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'

export function main() {
  const fire = engine.getEntityOrNullByName('campfire')
  if (!fire) return
  ParticleSystem.create(fire, { /* ... config ... */ })
}
```

## RULE: Transform.scale does NOT scale particles

Particle size is controlled exclusively by `initialSize` and `sizeOverTime` (`FloatRange`). The `ParticleSystem` also sets the emitter shape's spatial dimensions when the shape has size fields (Sphere radius, Box size, Cone radius). These are not affected by the entity's `Transform.scale`.

## RULE: Particles only render to players inside scene parcels

Players viewing the scene from outside its parcels see nothing. Particles are not part of the scene LOD silhouette. Position emitters within parcel bounds.

## RULE: Particles only work in the Unity explorer

The mobile Godot explorer and the Bevy explorer don't have this feature implemented. The renderer ignores the component. Design fallbacks (a glowing emissive sphere, a baked-in GLTF animation) for scenes that should look reasonable everywhere.

## RULE: Engine caps total particles at ~1000

The engine enforces a per-scene particle budget and will scale down emission rates across all active systems if total live particles would exceed the limit. Cap each system with `maxParticles` and prefer fewer impactful systems over many small ones.

## RULE: prewarm requires loop = true

`prewarm: true` only takes effect when `loop: true`. On a one-shot system (`loop: false`) prewarm is silently ignored.

## RULE: faceTravelDirection overrides billboard

When `faceTravelDirection: true`, particles orient along their velocity vector and `billboard` is ignored. Use this for trails/streaks (asteroids, bullets, sparks). Set `billboard: false` explicitly to avoid confusion.

## Import

```typescript
import { engine, ParticleSystem } from '@dcl/sdk/ecs'
import {
  PBParticleSystem_BlendMode,
  PBParticleSystem_PlaybackState,
  PBParticleSystem_SimulationSpace
} from '@dcl/sdk/ecs'
import { Color4, Vector3, Quaternion } from '@dcl/sdk/math'
```

Aliases `ParticleSystemBlendMode` and `ParticleSystemPlaybackState` are also exported from `@dcl/sdk/ecs` and are interchangeable with the `PB`-prefixed names. There is no `ParticleSystemSimulationSpace` alias — only `PBParticleSystem_SimulationSpace`. Prefer the `PB`-prefixed names everywhere for consistency.

## Field reference

| Field | Type | Default | Notes |
|---|---|---|---|
| `active` | `boolean` | `true` | Master on/off for new emission. |
| `rate` | `number` | `10` | Particles emitted per second (continuous). Set to `0` when using `bursts`. |
| `maxParticles` | `number` | `1000` | Hard cap on simultaneous live particles for this system. |
| `lifetime` | `number` | `5` | Particle lifespan in seconds. |
| `gravity` | `number` | `0` | Multiplier on scene gravity (~ -9.81 m/s²). Negative = particles rise. |
| `additionalForce` | `Vector3` | — | Constant force vector applied each frame (world space). |
| `initialSize` | `FloatRange` | `{start:1, end:1}` | Random size at spawn. |
| `sizeOverTime` | `FloatRange` | `{start:1, end:1}` | Size lerped start→end over particle lifetime. |
| `initialRotation` | `Quaternion` | identity | Spawn orientation. |
| `rotationOverTime` | `Quaternion` | identity | Per-axis angular velocity. |
| `faceTravelDirection` | `boolean` | `false` | Orient along velocity. Overrides `billboard`. |
| `initialColor` | `ColorRange` | `{white,white}` | Random color at spawn. |
| `colorOverTime` | `ColorRange` | `{white,white}` | Color lerped start→end. Use alpha=0 at end to fade out. |
| `initialVelocitySpeed` | `FloatRange` | `{start:1, end:1}` | Initial speed in m/s, randomized per particle. |
| `texture` | `Texture` | white quad | Particle sprite. Same `Texture` shape as Material textures. |
| `blendMode` | `PBParticleSystem_BlendMode` | `PSB_ALPHA` | `PSB_ALPHA` / `PSB_ADD` / `PSB_MULTIPLY`. |
| `billboard` | `boolean` | `true` | Particles always face camera. |
| `spriteSheet` | `{tilesX, tilesY, framesPerSecond?}` | — | Texture-atlas frame animation. |
| `shape` | oneof Point/Sphere/Cone/Box | Point | Emitter geometry. |
| `loop` | `boolean` | `true` | Loop emission cycle. `false` = one-shot. |
| `prewarm` | `boolean` | `false` | Start as if one full loop already simulated. Requires `loop: true`. |
| `simulationSpace` | `PBParticleSystem_SimulationSpace` | `PSS_LOCAL` | `PSS_LOCAL` (move with entity) / `PSS_WORLD` (stay put after spawn). |
| `limitVelocity` | `{speed, dampen?}` | — | Clamp top speed. `dampen` 0–1, default `1` = hard clamp. |
| `playbackState` | `PBParticleSystem_PlaybackState` | `PS_PLAYING` | `PS_PLAYING` / `PS_PAUSED` / `PS_STOPPED`. |
| `bursts` | `{values: Burst[]}` | — | Discrete emission events. |

`FloatRange = { start: number, end: number }`. `ColorRange = { start: Color4, end: Color4 }`.

## Emitter shapes

Use `ParticleSystem.Shape.*` helpers — never assemble the `oneof` manually:

```typescript
shape: ParticleSystem.Shape.Point()
shape: ParticleSystem.Shape.Sphere({ radius: 1 })
shape: ParticleSystem.Shape.Cone({ angle: 25, radius: 1 })  // angle = half-angle in degrees
shape: ParticleSystem.Shape.Box({ size: Vector3.create(1, 1, 1) })
```

- **Point** — emits from entity origin.
- **Sphere** — random points inside a sphere of `radius`.
- **Cone** — base disk projecting outward within `angle` half-angle. Cone direction is the entity's local forward; rotate the parent Transform to aim it.
- **Box** — random points inside an axis-aligned box of `size`.

To rotate the emission direction (snow falling, rain), rotate the parent entity's `Transform.rotation` (in `main-entities.ts`).

## Bursts

Discrete emission events at specific times. Set `rate: 0` to use bursts only, or combine with `rate > 0` for continuous + bursty.

```typescript
bursts: {
  values: [{ time: 0, count: 100, cycles: 1, interval: 0.01, probability: 1.0 }]
}
```

Burst fields: `time` (s from cycle start), `count` (particles per burst), `cycles` (default `1`, `0` = infinite), `interval` (s between cycles, default `0.01`), `probability` (0–1 chance per cycle, default `1`). Multiple bursts in one cycle = staggered ignition pattern (fireworks).

## Common patterns

```typescript
// 1. Fire ember — Point + ADD blend, slight upward drift
const fire = engine.getEntityOrNullByName('campfire')
if (fire) ParticleSystem.create(fire, {
  rate: 40,
  lifetime: 2,
  maxParticles: 200,
  initialSize: { start: 0.1, end: 0.3 },
  sizeOverTime: { start: 1.0, end: 0.0 },
  initialColor: { start: Color4.create(1, 0.6, 0.1, 1), end: Color4.create(1, 0.2, 0, 1) },
  colorOverTime: { start: Color4.create(1, 0.5, 0.1, 1), end: Color4.create(0.2, 0, 0, 0) },
  initialVelocitySpeed: { start: 1.5, end: 2.5 },
  gravity: -0.3,
  blendMode: PBParticleSystem_BlendMode.PSB_ADD,
  shape: ParticleSystem.Shape.Point()
})

// 2. One-shot burst — explosion/pickup VFX
ParticleSystem.create(entity, {
  loop: false,
  rate: 0,
  lifetime: 3,
  maxParticles: 150,
  initialSize: { start: 0.1, end: 0.25 },
  sizeOverTime: { start: 1.0, end: 0.0 },
  initialVelocitySpeed: { start: 2, end: 4 },
  shape: ParticleSystem.Shape.Sphere({ radius: 0.5 }),
  bursts: {
    values: [{ time: 0, count: 100, cycles: 1, interval: 0.01, probability: 1.0 }]
  }
})
```

## Playback control

```typescript
const ps = ParticleSystem.getMutable(entity)
ps.playbackState = PBParticleSystem_PlaybackState.PS_PAUSED   // pause + freeze particles
ps.playbackState = PBParticleSystem_PlaybackState.PS_PLAYING  // resume
ps.playbackState = PBParticleSystem_PlaybackState.PS_STOPPED  // hard cut, clear live particles
ps.active = false                                              // graceful trail-off
```

## Sprite-sheet animation

Texture atlas with frames laid out in a grid (left-to-right, top-to-bottom). Total frames = `tilesX * tilesY`.

```typescript
texture: { src: 'images/flame-sheet.png' },
spriteSheet: { tilesX: 4, tilesY: 3, framesPerSecond: 12 }
```

## Simulation space (local vs world)

- `PSS_LOCAL` (default) — particles move with the emitter. A moving emitter drags its particle cloud. Good for auras / halos on moving entities.
- `PSS_WORLD` — particles stay at their spawn position in world space. A moving emitter leaves a trail. Required for proper trails combined with `Tween` movement on the emitter.

## Texture field

```typescript
texture: { src: 'images/spark.png' }
```

The full `Texture` form supports filterMode/wrapMode but particle systems generally only need `src`. Avatar/Video textures on particles are unverified — stick with file textures.

## Gotchas

- **`rotationOverTime`** is interpreted as per-axis angular velocity. `Quaternion.fromEulerDegrees(0, 90, 0)` = spin 90°/s on Y. Identity = no spin.
- **`additionalForce` is world-space** even when `simulationSpace = PSS_LOCAL`. Wind/drift directions stay constant regardless of emitter rotation.
- **`limitVelocity.dampen = 1`** = hard clamp. Lower values let velocity exceed cap briefly then decay.
- **Color alpha = 0 at end of `colorOverTime`** is the standard way to fade particles out.
- **No mesh attached to the emitter entity** — adding `MeshRenderer` is unrelated; particles render from the ParticleSystem component itself.

## Performance

- Cap each system with `maxParticles`. Total scene budget across all systems is ~1000.
- Keep `lifetime * rate` low; that product is the steady-state live count.
- Disable systems out of view via `playbackState = PS_STOPPED` or `active = false`.
- Prefer `PSB_ALPHA` for opaque/translucent effects. `PSB_ADD` is best for glow/fire (it stacks visually) but multi-layer additive overdraw is the most expensive case.
- One texture per system.

## Resources

- Test scene: https://github.com/decentraland/sdk7-test-scenes/tree/main/scenes/0%2C7-particle-system
- Live tuner: `ParticleLab.dcl.eth` (open with Decentraland client).
