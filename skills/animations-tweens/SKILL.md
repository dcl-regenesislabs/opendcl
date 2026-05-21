---
name: animations-tweens
description: Animate objects in Decentraland scenes. Play GLTF model animations with Animator, create procedural motion with Tween (move/rotate/scale), and chain sequences with TweenSequence. Use when the user wants to animate, move, rotate, spin, slide, bob, or create motion effects. Do NOT use for audio/video playback (see audio-video).
---

# Animations and Tweens in Decentraland

## Authoring split

`Animator`, `Tween`, and `TweenSequence` are all supported in `main-entities.ts` — declare the entity, its visual components, and its initial animation state in the literal. Switch clips or replace tweens at runtime in `src/index.ts` via `getMutable`.

## When to Use Which Animation Approach

| Need | Approach | When |
|------|----------|------|
| Play animation baked into a .glb model | `Animator` | Character walks, door opens, flag waves — any animation created in Blender/Maya |
| Move/rotate/scale an entity smoothly | `Tween` | Sliding doors, floating platforms, growing objects — procedural A-to-B motion |
| Chain multiple animations in sequence | `TweenSequence` | Patrol paths, multi-step doors, complex choreography |
| Continuous per-frame control | `engine.addSystem()` | Physics-like motion, following a target, custom easing |

**Decision flow:**
1. Does the .glb model already have the animation? → `Animator`
2. Is it a simple move/rotate/scale between two values? → `Tween`
3. Do you need frame-by-frame control or custom math? → System with `dt`

## GLTF Animations (Animator)

Declare the character and its animation states in `main-entities.ts`. The `states` array is part of the `Animator` shape and is JSON-compatible.

```typescript
// main-entities.ts
import type { Scene } from '@dcl/sdk/scene-types'

export const scene = {
  character: {
    components: {
      Transform: { position: { x: 8, y: 0, z: 8 } },
      GltfContainer: { src: 'models/character.glb' },
      Animator: {
        states: [
          { clip: 'idle', playing: true, loop: true, speed: 1 },
          { clip: 'walk', playing: false, loop: true, speed: 1 },
          { clip: 'attack', playing: false, loop: false, speed: 1.5 }
        ]
      }
    }
  }
} satisfies Scene
```

Trigger and switch animations at runtime in `src/index.ts`:

```typescript
import { engine, Animator } from '@dcl/sdk/ecs'

export function main() {
  const character = engine.getEntityOrNullByName('character')
  if (!character) return

  // Play a specific animation
  Animator.playSingleAnimation(character, 'walk')

  // Stop all animations
  // Animator.stopAllAnimations(character)
}
```

### Switching Animations
```typescript
import { Entity, Animator } from '@dcl/sdk/ecs'

function playAnimation(entity: Entity, clipName: string) {
  const animator = Animator.getMutable(entity)
  for (const state of animator.states) state.playing = false
  const state = animator.states.find(s => s.clip === clipName)
  if (state) state.playing = true
}
```

## Tweens

`Tween` and `TweenSequence` are JSON-compatible. The `mode` is a `$case`-tagged union; positions/quaternions are plain object literals; easing is a numeric enum.

### Move
```typescript
// main-entities.ts
sliding_box: {
  components: {
    Transform: { position: { x: 2, y: 1, z: 8 } },
    MeshRenderer: { mesh: { $case: 'box', box: { uvs: [] } } },
    Tween: {
      duration: 2000,  // milliseconds
      easingFunction: 6,  // EasingFunction.EF_EASESINE
      mode: {
        $case: 'move',
        move: { start: { x: 2, y: 1, z: 8 }, end: { x: 14, y: 1, z: 8 } }
      }
    }
  }
}
```

Common easing values: `0 = EF_LINEAR`, `1 = EF_EASEINQUAD`, `2 = EF_EASEOUTQUAD`, `3 = EF_EASEQUAD`, `6 = EF_EASESINE`. To replace or stop a tween at runtime, use `Tween.createOrReplace` / `Tween.deleteFrom` on the named entity in `src/index.ts`.

### Rotate

```typescript
// main-entities.ts — quaternions are { x, y, z, w } literals.
// 360° around Y end-state is { x: 0, y: 1, z: 0, w: 0 }
spinning_obj: {
  components: {
    Transform: { position: { x: 8, y: 1, z: 8 } },
    MeshRenderer: { mesh: { $case: 'box', box: { uvs: [] } } },
    Tween: {
      duration: 3000,
      easingFunction: 0,  // EF_LINEAR
      mode: {
        $case: 'rotate',
        rotate: {
          start: { x: 0, y: 0, z: 0, w: 1 },
          end: { x: 0, y: 1, z: 0, w: 0 }
        }
      }
    }
  }
}
```

For exact-degree rotations without hand-computing quaternions, leave the tween out of `main-entities.ts` and create it at runtime in `src/index.ts` where `Quaternion.fromEulerDegrees()` is available:

```typescript
// src/index.ts — runtime tween authoring (helpers allowed)
import { engine, Tween, EasingFunction } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'

export function main() {
  const box = engine.getEntityOrNullByName('spinning_obj')
  if (!box) return
  Tween.createOrReplace(box, {
    mode: Tween.Mode.Rotate({
      start: Quaternion.fromEulerDegrees(0, 0, 0),
      end: Quaternion.fromEulerDegrees(0, 360, 0)
    }),
    duration: 3000,
    easingFunction: EasingFunction.EF_LINEAR
  })
}
```

### Scale

```typescript
// main-entities.ts
grow_box: {
  components: {
    Transform: { position: { x: 8, y: 1, z: 8 } },
    MeshRenderer: { mesh: { $case: 'box', box: { uvs: [] } } },
    Tween: {
      duration: 1000,
      easingFunction: 14,  // EF_EASEOUTBOUNCE
      mode: {
        $case: 'scale',
        scale: { start: { x: 1, y: 1, z: 1 }, end: { x: 2, y: 2, z: 2 } }
      }
    }
  }
}
```

## Tween Sequences (Chained Animations)

Chain multiple tweens to play one after another. `TweenSequence` is supported in `main-entities.ts`:

```typescript
// main-entities.ts
patrol_box: {
  components: {
    Transform: { position: { x: 2, y: 1, z: 8 } },
    MeshRenderer: { mesh: { $case: 'box', box: { uvs: [] } } },
    Tween: {
      duration: 2000,
      easingFunction: 6,  // EF_EASESINE
      mode: { $case: 'move', move: { start: { x: 2, y: 1, z: 8 }, end: { x: 14, y: 1, z: 8 } } }
    },
    TweenSequence: {
      loop: 0,  // TweenLoop.TL_RESTART (1 = TL_YOYO)
      sequence: [
        {
          duration: 2000,
          easingFunction: 6,
          mode: { $case: 'move', move: { start: { x: 14, y: 1, z: 8 }, end: { x: 2, y: 1, z: 8 } } }
        }
      ]
    }
  }
}
```

## Easing Functions

Inside `main-entities.ts` use the integer values (left). In `src/index.ts` you can reference `EasingFunction.<NAME>` directly.

| value | enum | shape |
|---|---|---|
| 0  | EF_LINEAR          | Constant speed |
| 1  | EF_EASEINQUAD      | Quadratic in |
| 2  | EF_EASEOUTQUAD     | Quadratic out |
| 3  | EF_EASEQUAD        | Quadratic in-out |
| 4  | EF_EASEINSINE      | Sinusoidal in |
| 5  | EF_EASEOUTSINE     | Sinusoidal out |
| 6  | EF_EASESINE        | Sinusoidal in-out (smooth) |
| 7  | EF_EASEINEXPO      | Exponential in |
| 8  | EF_EASEOUTEXPO     | Exponential out |
| 9  | EF_EASEEXPO        | Exponential in-out |
| 10 | EF_EASEINELASTIC   | Elastic in |
| 11 | EF_EASEOUTELASTIC  | Elastic out |
| 12 | EF_EASEELASTIC     | Elastic in-out |
| 13 | EF_EASEINBOUNCE    | Bounce in |
| 14 | EF_EASEOUTBOUNCE   | Bounce out |
| 15 | EF_EASEBOUNCE      | Bounce in-out |
| 16 | EF_EASEINCUBIC     | Cubic in |
| 17 | EF_EASEOUTCUBIC    | Cubic out |
| 18 | EF_EASECUBIC       | Cubic in-out |
| 19 | EF_EASEINQUART     | Quartic in |
| 20 | EF_EASEOUTQUART    | Quartic out |
| 21 | EF_EASEQUART       | Quartic in-out |
| 22 | EF_EASEINQUINT     | Quintic in |
| 23 | EF_EASEOUTQUINT    | Quintic out |
| 24 | EF_EASEQUINT       | Quintic in-out |
| 25 | EF_EASEINCIRC      | Circular in |
| 26 | EF_EASEOUTCIRC     | Circular out |
| 27 | EF_EASECIRC        | Circular in-out |
| 28 | EF_EASEINBACK      | Overshoot in |
| 29 | EF_EASEOUTBACK     | Overshoot out |
| 30 | EF_EASEBACK        | Overshoot in-out |

## Custom Animation Systems

For complex animations, create a system:

```typescript
// Continuous rotation system
function spinSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(Transform, Spinner)) {
    const transform = Transform.getMutable(entity)
    const spinner = Spinner.get(entity)
    // Rotate around Y axis
    const currentRotation = Quaternion.toEulerAngles(transform.rotation)
    transform.rotation = Quaternion.fromEulerDegrees(
      currentRotation.x,
      currentRotation.y + spinner.speed * dt,
      currentRotation.z
    )
  }
}

engine.addSystem(spinSystem)
```

### Tween Helper Methods

Use shorthand helpers that create or replace the Tween component directly on the entity:

```typescript
import { Tween, EasingFunction } from '@dcl/sdk/ecs'

// Move — signature: Tween.setMove(entity, start, end, duration, easingFunction?)
Tween.setMove(entity,
  Vector3.create(0, 1, 0), Vector3.create(0, 3, 0),
  1500, EasingFunction.EF_EASEINBOUNCE
)

// Rotate — signature: Tween.setRotate(entity, start, end, duration, easingFunction?)
Tween.setRotate(entity,
  Quaternion.fromEulerDegrees(0, 0, 0), Quaternion.fromEulerDegrees(0, 180, 0),
  2000, EasingFunction.EF_EASEOUTQUAD
)

// Scale — signature: Tween.setScale(entity, start, end, duration, easingFunction?)
Tween.setScale(entity,
  Vector3.One(), Vector3.create(2, 2, 2),
  1000, EasingFunction.EF_LINEAR
)

// Combined Move + Rotate + Scale in one Tween
Tween.setMoveRotateScale(entity, {
  positionStart: Vector3.create(0, 0, 0), positionEnd: Vector3.create(0, 5, 0),
  rotationStart: Quaternion.fromEulerDegrees(0, 0, 0), rotationEnd: Quaternion.fromEulerDegrees(0, 360, 0),
  scaleStart: Vector3.One(), scaleEnd: Vector3.create(0.5, 0.5, 0.5)
}, 2000, EasingFunction.EF_EASEINOUTCUBIC)

// Continuous spin — applies a per-frame Quaternion delta. No end state.
Tween.setRotateContinuous(entity, Quaternion.fromEulerDegrees(0, -1, 0), 700)

// Continuous move — applies a per-frame Vector3 delta scaled by speed.
Tween.setMoveContinuous(entity, Vector3.create(0, 0, 1), 0.5)
```

`*Continuous` variants don't end — they apply a constant delta until the Tween is removed (`Tween.deleteFrom(entity)`).

### Yoyo Loop Mode

`TL_YOYO` reverses the tween at each end instead of restarting:

```typescript
TweenSequence.create(entity, {
  sequence: [{ duration: 1000, ... }],
  loop: TweenLoop.TL_YOYO
})
```

### Detecting Tween Completion

Use `tweenSystem.tweenCompleted()` to check if a tween finished this frame:

```typescript
engine.addSystem(() => {
  if (tweenSystem.tweenCompleted(entity)) {
    console.log('Tween finished on', entity)
  }
})
```

### Animator Extras

Additional `Animator` features:

```typescript
// Get a specific clip to modify
const clip = Animator.getClip(entity, 'Walk')

// shouldReset: restart animation from beginning when re-triggered
Animator.playSingleAnimation(entity, 'Attack', true) // resets to start

// weight: blend between animations (0.0 to 1.0)
const anim = Animator.getMutable(entity)
anim.states[0].weight = 0.5  // blend walk at 50%
anim.states[1].weight = 0.5  // blend idle at 50%
```

### Morph Targets (Blend Shapes)

If a GLTF model exports morph targets (e.g., facial expressions, shape blends), drive them via the `weights` array on each `Animator.state`. Indices match the order morph targets were exported. Values range `0`–`1`.

```typescript
const anim = Animator.getMutable(entity)
const state = anim.states.find(s => s.clip === 'Idle')
if (state) {
  state.weights = state.weights ?? []
  state.weights[0] = 0.8   // morph target 0 at 80%
  state.weights[1] = 0.3   // morph target 1 at 30%
}
```

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| GLTF animation not playing | Wrong clip name in `Animator.states` | Open the .glb in a viewer (e.g., Blender) to find exact clip names — they are case-sensitive |
| Animator component has no effect | Entity missing `GltfContainer` | `Animator` only works on entities that have a loaded GLTF model |
| Tween doesn't move | Start and end positions are the same | Verify `start` and `end` values differ in `Tween.Mode.Move()` |
| Tween plays once then stops | No `TweenSequence` with loop | Add `TweenSequence.create(entity, { sequence: [], loop: TweenLoop.TL_YOYO })` for back-and-forth |
| Animation jitters or stutters | Creating new Tween every frame | Only create Tween once, not inside a system — use `tweenSystem.tweenCompleted()` to chain |

> **Need 3D models to animate?** See the **add-3d-models** skill for loading GLTF models that contain animation clips.

## Best Practices

- Use Tweens for simple A-to-B animations (doors, platforms, UI elements)
- Use Animator for character/model animations baked into GLTF files
- Use Systems for continuous or physics-based animations
- Tween durations are in **milliseconds** (1000 = 1 second)
- Combine move + rotate tweens by applying them to parent/child entities
- For looping: use `TweenSequence` with `loop: TweenLoop.TL_RESTART`
