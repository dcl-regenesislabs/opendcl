---
name: animations-tweens
description: Animate objects in Decentraland scenes. Play GLTF model animations with Animator, create procedural motion with Tween (move/rotate/scale), and chain sequences with TweenSequence. Use when the user wants to animate, move, rotate, spin, slide, bob, or create motion effects. Do NOT use for audio/video playback (see audio-video).
---

# Animations and Tweens in Decentraland

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

Play animations embedded in .glb models:

```typescript
import { engine, Transform, GltfContainer, Animator } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const character = engine.addEntity()
Transform.create(character, { position: Vector3.create(8, 0, 8) })
GltfContainer.create(character, { src: 'models/character.glb' })

// Set up animation states
Animator.create(character, {
  states: [
    { clip: 'idle', playing: true, loop: true, speed: 1 },
    { clip: 'walk', playing: false, loop: true, speed: 1 },
    { clip: 'attack', playing: false, loop: false, speed: 1.5 }
  ]
})

// Play a specific animation
Animator.playSingleAnimation(character, 'walk')

// Stop all animations
Animator.stopAllAnimations(character)
```

### Switching Animations
```typescript
function playAnimation(entity: Entity, clipName: string) {
  const animator = Animator.getMutable(entity)
  // Stop all
  for (const state of animator.states) {
    state.playing = false
  }
  // Play the desired one
  const state = animator.states.find(s => s.clip === clipName)
  if (state) {
    state.playing = true
  }
}
```

## Tweens (Code-Based Animation)

Animate entity properties smoothly over time:

### Move
```typescript
import { engine, Transform, Tween, EasingFunction } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const box = engine.addEntity()
Transform.create(box, { position: Vector3.create(2, 1, 8) })

Tween.create(box, {
  mode: Tween.Mode.Move({
    start: Vector3.create(2, 1, 8),
    end: Vector3.create(14, 1, 8)
  }),
  duration: 2000,  // milliseconds
  easingFunction: EasingFunction.EF_EASESINE
})
```

### Rotate
```typescript
Tween.create(box, {
  mode: Tween.Mode.Rotate({
    start: Quaternion.fromEulerDegrees(0, 0, 0),
    end: Quaternion.fromEulerDegrees(0, 360, 0)
  }),
  duration: 3000,
  easingFunction: EasingFunction.EF_LINEAR
})
```

### Scale
```typescript
Tween.create(box, {
  mode: Tween.Mode.Scale({
    start: Vector3.create(1, 1, 1),
    end: Vector3.create(2, 2, 2)
  }),
  duration: 1000,
  easingFunction: EasingFunction.EF_EASEOUTBOUNCE
})
```

## Tween Sequences (Chained Animations)

Chain multiple tweens to play one after another:

```typescript
import { TweenSequence, TweenLoop } from '@dcl/sdk/ecs'

// First tween
Tween.create(box, {
  mode: Tween.Mode.Move({
    start: Vector3.create(2, 1, 8),
    end: Vector3.create(14, 1, 8)
  }),
  duration: 2000,
  easingFunction: EasingFunction.EF_EASESINE
})

// Chain sequence
TweenSequence.create(box, {
  sequence: [
    // Second: move back
    {
      mode: Tween.Mode.Move({
        start: Vector3.create(14, 1, 8),
        end: Vector3.create(2, 1, 8)
      }),
      duration: 2000,
      easingFunction: EasingFunction.EF_EASESINE
    }
  ],
  loop: TweenLoop.TL_RESTART // Loop the entire sequence
})
```

## Easing Functions

Available easing functions from `EasingFunction`:
- `EF_LINEAR` — Constant speed
- `EF_EASEINQUAD` / `EF_EASEOUTQUAD` / `EF_EASEQUAD` — Quadratic
- `EF_EASEINSINE` / `EF_EASEOUTSINE` / `EF_EASESINE` — Sinusoidal (smooth)
- `EF_EASEINEXPO` / `EF_EASEOUTEXPO` / `EF_EASEEXPO` — Exponential
- `EF_EASEINELASTIC` / `EF_EASEOUTELASTIC` / `EF_EASEELASTIC` — Elastic bounce
- `EF_EASEOUTBOUNCE` / `EF_EASEINBOUNCE` / `EF_EASEBOUNCE` — Bounce effect
- `EF_EASEINBACK` / `EF_EASEOUTBACK` / `EF_EASEBACK` — Overshoot
- `EF_EASEINCUBIC` / `EF_EASEOUTCUBIC` / `EF_EASECUBIC` — Cubic
- `EF_EASEINQUART` / `EF_EASEOUTQUART` / `EF_EASEQUART` — Quartic
- `EF_EASEINQUINT` / `EF_EASEOUTQUINT` / `EF_EASEQUINT` — Quintic
- `EF_EASEINCIRC` / `EF_EASEOUTCIRC` / `EF_EASECIRC` — Circular

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
```

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
