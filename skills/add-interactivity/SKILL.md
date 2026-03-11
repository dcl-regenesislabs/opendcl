---
name: add-interactivity
description: Add click handlers, hover effects, pointer events, trigger areas, raycasting, and global input to Decentraland scene entities. Use when the user wants to make objects clickable, add hover effects, detect player proximity, handle E/F key actions, or cast rays. Do NOT use for advanced input patterns like movement restriction, cursor lock, or WASD control (see advanced-input). Do NOT use for screen-space UI buttons (see build-ui).
---

# Adding Interactivity to Decentraland Scenes

## Decision Tree

| Need | Approach | API |
|------|----------|-----|
| Click/hover on a specific entity | Pointer events | `pointerEventsSystem.onPointerDown()` |
| Detect player entering an area | Trigger area | `TriggerArea` + `triggerAreaEventsSystem` |
| Poll key state every frame | Global input | `inputSystem.isTriggered()` / `isPressed()` |
| Detect objects in a direction | Raycasting | `raycastSystem` or `Raycast` component |
| Read cursor position / lock state | Cursor state | `PointerLock`, `PrimaryPointerInfo` |

---

## Pointer Events (Click / Hover)

### Using the Helper System (Recommended)
```typescript
import { engine, Transform, MeshRenderer, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const cube = engine.addEntity()
Transform.create(cube, { position: Vector3.create(8, 1, 8) })
MeshRenderer.setBox(cube)

// Add click handler
pointerEventsSystem.onPointerDown(
  {
    entity: cube,
    opts: {
      button: InputAction.IA_POINTER,    // Left click
      hoverText: 'Click me!',
      maxDistance: 10
    }
  },
  (event) => {
    console.log('Cube clicked!', event.hit?.position)
  }
)
```

### All Input Actions
```typescript
InputAction.IA_POINTER    // Left mouse button
InputAction.IA_PRIMARY    // E key
InputAction.IA_SECONDARY  // F key
InputAction.IA_ACTION_3   // 1 key
InputAction.IA_ACTION_4   // 2 key
InputAction.IA_ACTION_5   // 3 key
InputAction.IA_ACTION_6   // 4 key
InputAction.IA_JUMP       // Space key
InputAction.IA_FORWARD    // W key
InputAction.IA_BACKWARD   // S key
InputAction.IA_LEFT       // A key
InputAction.IA_RIGHT      // D key
InputAction.IA_WALK       // Shift key
```

### All Event Types
```typescript
PointerEventType.PET_DOWN         // Button pressed
PointerEventType.PET_UP           // Button released
PointerEventType.PET_HOVER_ENTER  // Cursor enters entity
PointerEventType.PET_HOVER_LEAVE  // Cursor leaves entity
```

### Pointer Up (Release)
```typescript
pointerEventsSystem.onPointerDown(
  { entity: cube, opts: { button: InputAction.IA_POINTER, hoverText: 'Hold me' } },
  () => { console.log('Pressed!') }
)

pointerEventsSystem.onPointerUp(
  { entity: cube, opts: { button: InputAction.IA_POINTER } },
  () => { console.log('Released!') }
)
```

### Removing Handlers
```typescript
pointerEventsSystem.removeOnPointerDown(cube)
pointerEventsSystem.removeOnPointerUp(cube)
```

### Important: Colliders Required
Pointer events only work on entities with a **collider**. Add one if your entity doesn't have a mesh:
```typescript
import { MeshCollider } from '@dcl/sdk/ecs'
MeshCollider.setBox(entity) // Invisible box collider
```

For GLTF models, set the collision mask:
```typescript
GltfContainer.create(entity, {
  src: 'models/button.glb',
  visibleMeshesCollisionMask: ColliderLayer.CL_POINTER
})
```

---

## Trigger Areas (Proximity Detection)

Detect when the player enters, exits, or stays inside an area:

```typescript
import { engine, Transform, TriggerArea } from '@dcl/sdk/ecs'
import { triggerAreaEventsSystem } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const area = engine.addEntity()
TriggerArea.setBox(area) // or TriggerArea.setSphere(area)
Transform.create(area, {
  position: Vector3.create(8, 0, 8),
  scale: Vector3.create(4, 4, 4) // Size the area via Transform.scale
})

// Register enter/exit/stay events
triggerAreaEventsSystem.onTriggerEnter(area, (event) => {
  console.log('Entity entered trigger:', event.trigger.entity)
})

triggerAreaEventsSystem.onTriggerExit(area, () => {
  console.log('Entity exited trigger')
})

triggerAreaEventsSystem.onTriggerStay(area, () => {
  // Called every frame while an entity is inside
})
```

By default, trigger areas react to the player layer. Use `ColliderLayer` to restrict which entities activate the area:

```typescript
import { ColliderLayer, MeshCollider } from '@dcl/sdk/ecs'

// Area that only reacts to custom layers
TriggerArea.setBox(area, ColliderLayer.CL_CUSTOM1 | ColliderLayer.CL_CUSTOM2)

// Mark a moving entity to activate the area
const mover = engine.addEntity()
Transform.create(mover, { position: Vector3.create(8, 0, 8) })
MeshCollider.setBox(mover, ColliderLayer.CL_CUSTOM1)
```

---

## Raycasting

### Raycast Direction Types

Four direction modes are available:

```typescript
// 1. Local direction — relative to entity rotation
{ $case: 'localDirection', localDirection: Vector3.Forward() }

// 2. Global direction — world-space, ignores entity rotation
{ $case: 'globalDirection', globalDirection: Vector3.Down() }

// 3. Global target — aim at a world position
{ $case: 'globalTarget', globalTarget: Vector3.create(10, 0, 10) }

// 4. Target entity — aim at another entity
{ $case: 'targetEntity', targetEntity: entityId }
```

### Callback-Based Raycasting (Recommended)

```typescript
import { raycastSystem, RaycastQueryType, ColliderLayer } from '@dcl/sdk/ecs'

// Local direction raycast
raycastSystem.registerLocalDirectionRaycast(
  { entity: myEntity, opts: { queryType: RaycastQueryType.RQT_HIT_FIRST, direction: Vector3.Forward(), maxDistance: 16, collisionMask: ColliderLayer.CL_POINTER } },
  (result) => {
    if (result.hits.length > 0) {
      console.log('Hit:', result.hits[0].entityId)
    }
  }
)

// Global direction raycast
raycastSystem.registerGlobalDirectionRaycast(
  { entity: myEntity, opts: { queryType: RaycastQueryType.RQT_HIT_FIRST, direction: Vector3.Down(), maxDistance: 20 } },
  (result) => { /* handle hits */ }
)

// Target position raycast
raycastSystem.registerGlobalTargetRaycast(
  { entity: myEntity, opts: { globalTarget: Vector3.create(8, 0, 8), maxDistance: 20 } },
  (result) => { /* handle result */ }
)

// Target entity raycast
raycastSystem.registerTargetEntityRaycast(
  { entity: sourceEntity, opts: { targetEntity: targetEntity, maxDistance: 15 } },
  (result) => { /* handle result */ }
)

// Remove raycast from entity
raycastSystem.removeRaycasterEntity(myEntity)
```

### Component-Based Raycasting

```typescript
import { engine, Raycast, RaycastResult, RaycastQueryType } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const rayEntity = engine.addEntity()
Raycast.create(rayEntity, {
  direction: { $case: 'localDirection', localDirection: Vector3.Forward() },
  maxDistance: 16,
  queryType: RaycastQueryType.RQT_HIT_FIRST,
  continuous: false // Set true for continuous raycasting
})

// Check results
engine.addSystem(() => {
  const result = RaycastResult.getOrNull(rayEntity)
  if (result && result.hits.length > 0) {
    const hit = result.hits[0]
    console.log('Hit entity:', hit.entityId, 'at', hit.position)
  }
})
```

### Camera Raycast

Cast a ray from the camera to detect what the player is looking at:

```typescript
raycastSystem.registerGlobalDirectionRaycast(
  {
    entity: engine.CameraEntity,
    opts: {
      direction: Vector3.rotate(Vector3.Forward(), Transform.get(engine.CameraEntity).rotation),
      maxDistance: 16
    }
  },
  (result) => {
    if (result.hits.length > 0) console.log('Looking at:', result.hits[0].entityId)
  }
)
```

---

## Global Input Handling

Listen for key presses anywhere (not entity-specific):

```typescript
import { inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'

engine.addSystem(() => {
  // Check if E key was just pressed this frame
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    console.log('E key pressed!')
  }

  // Check if a key is currently held down
  if (inputSystem.isPressed(InputAction.IA_SECONDARY)) {
    console.log('F key is held!')
  }

  // Entity-specific input via system
  const clickData = inputSystem.getInputCommand(
    InputAction.IA_POINTER,
    PointerEventType.PET_DOWN,
    myEntity
  )
  if (clickData) {
    console.log('Entity clicked via system:', clickData.hit.entityId)
  }
})
```

## Cursor State

```typescript
import { PointerLock, PrimaryPointerInfo } from '@dcl/sdk/ecs'

// Check if cursor is locked
const isLocked = PointerLock.get(engine.CameraEntity).isPointerLocked

// Get cursor position and world ray
const pointerInfo = PrimaryPointerInfo.get(engine.RootEntity)
console.log('Cursor position:', pointerInfo.screenCoordinates)
console.log('World ray direction:', pointerInfo.worldRayDirection)
```

---

## Toggle Pattern (Click to Switch States)

Common pattern for toggleable objects:

```typescript
let doorOpen = false

pointerEventsSystem.onPointerDown(
  { entity: door, opts: { button: InputAction.IA_POINTER, hoverText: 'Toggle door' } },
  () => {
    doorOpen = !doorOpen
    const mutableTransform = Transform.getMutable(door)
    mutableTransform.rotation = doorOpen
      ? Quaternion.fromEulerDegrees(0, 90, 0)
      : Quaternion.fromEulerDegrees(0, 0, 0)
  }
)
```

## Best Practices

- Always set `maxDistance` on pointer events (8-16m is typical)
- Always set `hoverText` so users know they can interact
- Clean up handlers when entities are removed
- Use `MeshCollider` for invisible trigger surfaces
- For complex interactions, use a system with state tracking
- Test interactions in preview — hover text should be visible and clear
- Set `continuous: false` on raycasts unless you need per-frame results
- Design for both desktop and mobile — mobile has no keyboard, rely on pointer and on-screen buttons

For the full input action list and advanced patterns, see `{baseDir}/references/input-reference.md`.
