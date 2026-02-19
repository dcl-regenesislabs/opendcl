---
name: smart-items
description: Use Decentraland asset pack smart items with pre-built behaviors like doors, buttons, platforms, teleporters, and interactive objects. Use when user wants pre-built interactive items, asset packs, doors, elevators, buttons, teleporters, or drag-and-drop style items.
---

# Smart Items in Decentraland

Smart Items are pre-built interactive objects from Decentraland's asset packs. They come with built-in behaviors and can be combined using actions and triggers.

## Available Asset Packs

| Pack | Contents |
|------|----------|
| **Smart Items** | Doors, buttons, platforms, teleporters, spawn points |
| **Cyberpunk** | Neon signs, holograms, futuristic furniture, vehicles |
| **Fantasy** | Medieval buildings, treasure chests, torches, trees |
| **Genesis City** | Urban buildings, street furniture, signs |
| **Sci-Fi** | Space station parts, control panels, airlocks |
| **Gallery** | Art frames, pedestals, display cases |
| **Steampunk** | Gears, pipes, Victorian furniture |
| **Pirates** | Ships, barrels, treasure, cannons |
| **Western** | Saloon, cacti, wagons, buildings |

## Using Smart Items via Code

Smart items from the Creator Hub use a component-based system. When coding manually, you can recreate their behavior:

### Door (Open/Close on Click)
```typescript
import { engine, Transform, GltfContainer, Animator, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

const door = engine.addEntity()
Transform.create(door, { position: Vector3.create(8, 0, 8) })
GltfContainer.create(door, { src: 'models/door.glb' })

let isOpen = false

// If the model has animations
Animator.create(door, {
  states: [
    { clip: 'open', playing: false, loop: false },
    { clip: 'close', playing: false, loop: false }
  ]
})

pointerEventsSystem.onPointerDown(
  { entity: door, opts: { button: InputAction.IA_POINTER, hoverText: 'Open/Close' } },
  () => {
    isOpen = !isOpen
    if (isOpen) {
      Animator.playSingleAnimation(door, 'open')
    } else {
      Animator.playSingleAnimation(door, 'close')
    }
  }
)
```

### Button (Trigger Action)
```typescript
const button = engine.addEntity()
Transform.create(button, { position: Vector3.create(6, 1, 8) })
GltfContainer.create(button, { src: 'models/button.glb' })

Animator.create(button, {
  states: [{ clip: 'press', playing: false, loop: false }]
})

pointerEventsSystem.onPointerDown(
  { entity: button, opts: { button: InputAction.IA_POINTER, hoverText: 'Press' } },
  () => {
    Animator.playSingleAnimation(button, 'press')
    // Trigger linked action
    onButtonPressed()
  }
)

function onButtonPressed() {
  // Do something — open a door, show UI, play sound, etc.
}
```

### Platform (Moving Platform)
```typescript
import { Tween, EasingFunction } from '@dcl/sdk/ecs'
import { TweenSequence, TweenLoop } from '@dcl/sdk/ecs'

const platform = engine.addEntity()
Transform.create(platform, { position: Vector3.create(8, 0, 8) })
GltfContainer.create(platform, { src: 'models/platform.glb' })

// Move up and down
Tween.create(platform, {
  mode: Tween.Mode.Move({
    start: Vector3.create(8, 0, 8),
    end: Vector3.create(8, 5, 8)
  }),
  duration: 3000,
  easingFunction: EasingFunction.EF_EASEINOUTSINE
})

TweenSequence.create(platform, {
  sequence: [{
    mode: Tween.Mode.Move({
      start: Vector3.create(8, 5, 8),
      end: Vector3.create(8, 0, 8)
    }),
    duration: 3000,
    easingFunction: EasingFunction.EF_EASEINOUTSINE
  }],
  loop: TweenLoop.TL_RESTART
})
```

### Teleporter
```typescript
import { movePlayerTo } from '~system/RestrictedActions'

const teleporter = engine.addEntity()
Transform.create(teleporter, { position: Vector3.create(4, 0, 4) })
GltfContainer.create(teleporter, { src: 'models/teleporter.glb' })

pointerEventsSystem.onPointerDown(
  { entity: teleporter, opts: { button: InputAction.IA_POINTER, hoverText: 'Teleport' } },
  () => {
    // Move player to target position
    void movePlayerTo({
      newRelativePosition: Vector3.create(12, 0, 12),
      cameraTarget: Vector3.create(12, 1, 13)
    })
  }
)
```

**Note**: `movePlayerTo` requires the `ALLOW_TO_MOVE_PLAYER_INSIDE_SCENE` permission in scene.json.

## Action/Trigger Pattern

Smart items in Creator Hub use an action/trigger pattern. You can replicate this:

```typescript
// Action registry
type Action = () => void
const actions: Map<string, Action> = new Map()

function registerAction(name: string, action: Action) {
  actions.set(name, action)
}

function triggerAction(name: string) {
  const action = actions.get(name)
  if (action) action()
}

// Register actions
registerAction('openDoor', () => {
  Animator.playSingleAnimation(door, 'open')
})

registerAction('playSound', () => {
  AudioSource.getMutable(speaker).playing = true
})

// Trigger from button
pointerEventsSystem.onPointerDown(
  { entity: button, opts: { button: InputAction.IA_POINTER, hoverText: 'Activate' } },
  () => {
    triggerAction('openDoor')
    triggerAction('playSound')
  }
)
```

## Tips

- Smart items from Creator Hub export as code — you can inspect and modify the generated code
- For complex item interactions, use an event bus pattern (register/trigger actions)
- Models for smart items are in the asset-packs repository
- Keep smart item models lightweight (under 1,000 triangles each)
- Combine multiple simple smart items rather than creating one complex one
