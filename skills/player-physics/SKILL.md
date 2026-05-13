---
name: player-physics
description: Apply physics forces to the player in Decentraland scenes. Impulses (one-shot pushes), knockback (push away from a point with falloff), continuous forces (wind tunnels, anti-gravity, lift, levitation, hover), timed forces, and repulsion fields. Use when the user wants launch pads, knockback on hit, wind zones, gravity fields, jumps, lifting/floating the player, pushing the player up/sideways/back, hover effects, or any scene-applied force on the player. THIS is also the right skill when an agent's first instinct is to mutate `Transform` on `engine.PlayerEntity` to move/lift/push the player — that does NOT work (the player Transform is engine-controlled and read-only); use the Physics API instead. Do NOT use for player movement speed (see player-avatar AvatarLocomotionSettings) or platform movement (see animations-tweens).
---

# Player Physics in Decentraland

Apply forces to the player's avatar using the `Physics` API from `@dcl/sdk/ecs`. All physics operations affect the **local player** only.

## Authoring split

Force calls are runtime — they live in `src/index.ts`. The **trigger entities** that cause forces (the launch pad, the wind tunnel volume, the repulsion field marker) are static placements and belong in `main-entities.ts` with a Transform (and optional `MeshRenderer` / `GltfContainer`). Wire pointer/proximity events or trigger systems in `src/index.ts` to call the `Physics.*` methods.

## Why this skill exists — the Transform mistake

The player's `Transform` (on `engine.PlayerEntity`) is **engine-controlled and read-only from scene code**. Writing to it via `Transform.getMutable`, `Transform.createOrReplace`, or direct `.position` / `.rotation` mutation **silently does nothing** — the code compiles, the system ticks, no error is thrown, and the avatar never moves.

**If your goal is to lift, float, push, knock back, or apply any sustained force to the player, use this skill's `Physics` API.** For instant teleports / smooth slides to a specific position, use `movePlayerTo` from `~system/RestrictedActions` (skill: `player-avatar`).

```typescript
// WRONG — has no effect in-world
const t = Transform.getMutable(engine.PlayerEntity)
t.position.y += 0.1   // ignored every frame

// CORRECT — lift the player upward
import { Physics } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
Physics.applyImpulseToPlayer(Vector3.create(0, 50, 0))         // one-shot upward launch
// or, sustained lift / hover:
const lifter = engine.getEntityOrNullByName('hover_zone')      // named entity from main-entities.ts
if (lifter) Physics.applyForceToPlayer(lifter, Vector3.create(0, 1, 0), 12)
// stop with: Physics.removeForceFromPlayer(lifter)
```

## Impulse (One-Shot Push)

Apply a single instantaneous force with `Physics.applyImpulseToPlayer(direction, magnitude?)`. Direction is auto-normalized when magnitude is passed separately. Multiple calls within the same frame are accumulated. Use for launch pads, jumps, and explosions.

## Knockback (Push Away from a Point)

Push the player away from a source position with `Physics.applyKnockbackToPlayer(sourcePos, magnitude, radius?, falloff?)`. Direction is computed automatically from source to player.

### KnockbackFalloff Options

| Falloff | Behavior |
|---|---|
| `KnockbackFalloff.CONSTANT` | Same magnitude at any distance within radius (default) |
| `KnockbackFalloff.LINEAR` | Smooth linear decrease to 0 at the radius edge |
| `KnockbackFalloff.INVERSE_SQUARE` | Sharp, physically-realistic drop-off |

If the player is exactly at the source, they are pushed straight up. A **negative magnitude** pulls the player toward the point (gravity well). The same falloff values apply to `applyRepulsionForceToPlayer()`.

## Continuous Force

Apply a persistent directional force identified by an **entity** (the force "owner"). Multiple forces from different entities stack.

- Apply: `Physics.applyForceToPlayer(entity, direction, magnitude?)`
- Remove: `Physics.removeForceFromPlayer(entity)`

Use with trigger zones for wind tunnels, conveyor belts, and gravity fields. The owner entity is just an ID handle for later removal — typically the named main-entities.ts entity representing the trigger zone.

## Timed Force

Apply a force for a fixed duration: `Physics.applyForceToPlayerForDuration(entity, seconds, direction, magnitude?)`. Expires automatically.

## Repulsion Force

Continuous push away from a fixed point with distance-based falloff, recalculated each frame: `Physics.applyRepulsionForceToPlayer(entity, position, magnitude, radius)`. The position must be passed explicitly — not read from the entity's Transform automatically. Remove with `Physics.removeForceFromPlayer(entity)`.

## Coordinate Conversion (Local to World Direction)

Convert local direction to world space with `Transform.localToWorldDirection(entity, localDir)`. Use when pushing relative to an entity's orientation (e.g. "forward from this cannon").

## Quick Reference

| Method | Type | Description |
|---|---|---|
| `Physics.applyImpulseToPlayer(dir, mag?)` | One-shot | Instant directional push |
| `Physics.applyKnockbackToPlayer(pos, mag, radius?, falloff?)` | One-shot | Push away from point |
| `Physics.applyForceToPlayer(entity, dir, mag?)` | Continuous | Persistent push while active |
| `Physics.removeForceFromPlayer(entity)` | Control | Stop a continuous force |
| `Physics.applyForceToPlayerForDuration(entity, secs, dir, mag?)` | Timed | Force that expires automatically |
| `Physics.applyRepulsionForceToPlayer(entity, pos, mag, radius)` | Continuous | Distance-based push from point |
| `Transform.localToWorldDirection(entity, dir)` | Utility | Convert local direction to world space |

## Best Practices

- Use `applyImpulseToPlayer` for one-off events (jump pads, explosions, hits).
- Use `applyForceToPlayer` + `removeForceFromPlayer` with trigger zones for areas (wind tunnels, conveyor belts).
- Use `KnockbackFalloff.LINEAR` for most area effects — it feels natural and predictable.
- Always check `result.trigger?.entity !== engine.PlayerEntity` in trigger callbacks to only affect the local player.
- A negative knockback magnitude creates a pull/gravity well effect.
- Multiple forces from different entities stack independently.
