# Input System Reference

## All Input Actions

| Action | Key Binding | Constant |
|--------|-------------|----------|
| Left mouse button | Mouse click / tap | `InputAction.IA_POINTER` |
| Primary action | E key | `InputAction.IA_PRIMARY` |
| Secondary action | F key | `InputAction.IA_SECONDARY` |
| Action 3 | 1 key | `InputAction.IA_ACTION_3` |
| Action 4 | 2 key | `InputAction.IA_ACTION_4` |
| Action 5 | 3 key | `InputAction.IA_ACTION_5` |
| Action 6 | 4 key | `InputAction.IA_ACTION_6` |
| Jump | Space key | `InputAction.IA_JUMP` |
| Forward | W key | `InputAction.IA_FORWARD` |
| Backward | S key | `InputAction.IA_BACKWARD` |
| Left | A key | `InputAction.IA_LEFT` |
| Right | D key | `InputAction.IA_RIGHT` |
| Walk | Shift key | `InputAction.IA_WALK` |

**Notes:**
- Mouse wheel is **not available** as an input
- Always design for both desktop and mobile — mobile has no keyboard, rely on pointer and on-screen buttons
- Set `maxDistance` on pointer events (8-10 meters typical) to prevent interactions from across the scene
- Use `hoverText` to communicate what an interaction does before the player commits

## All Pointer Event Types

```typescript
PointerEventType.PET_DOWN         // Button/key pressed
PointerEventType.PET_UP           // Button/key released
PointerEventType.PET_HOVER_ENTER  // Cursor enters entity bounds
PointerEventType.PET_HOVER_LEAVE  // Cursor leaves entity bounds
```

## Declarative Pointer Events Component

Instead of the callback system, you can use the `PointerEvents` component directly:

```typescript
import { PointerEvents, PointerEventType, InputAction } from '@dcl/sdk/ecs'

PointerEvents.create(entity, {
  pointerEvents: [
    {
      eventType: PointerEventType.PET_DOWN,
      eventInfo: {
        button: InputAction.IA_POINTER,
        hoverText: 'Click me',
        showFeedback: true,
        maxDistance: 10
      }
    }
  ]
})
```

Then read results in a system using `inputSystem.getInputCommand()`.

## Raycast Direction Types

```typescript
// 1. Local direction — relative to entity rotation
{ $case: 'localDirection', localDirection: Vector3.Forward() }

// 2. Global direction — world-space direction, ignores entity rotation
{ $case: 'globalDirection', globalDirection: Vector3.Down() }

// 3. Global target — aim at a specific world position
{ $case: 'globalTarget', globalTarget: Vector3.create(10, 0, 10) }

// 4. Target entity — aim at another entity dynamically
{ $case: 'targetEntity', targetEntity: entityId }
```

### Raycast Options

```typescript
{
  direction: Vector3.Forward(),
  maxDistance: 16,
  queryType: RaycastQueryType.RQT_HIT_FIRST,  // or RQT_QUERY_ALL
  originOffset: Vector3.create(0, 0.5, 0),     // offset from entity origin
  collisionMask: ColliderLayer.CL_PHYSICS | ColliderLayer.CL_CUSTOM1,
  continuous: false  // true = every frame, false = one-shot
}
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

## Avatar Modifier Areas

Modify how avatars appear or behave in a region:

```typescript
import { AvatarModifierArea, AvatarModifierType } from '@dcl/sdk/ecs'

AvatarModifierArea.create(entity, {
  area: { box: Vector3.create(4, 3, 4) },
  modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
  excludeIds: ['0x123...abc']  // Optional
})

// Available modifiers:
// AMT_HIDE_AVATARS      — Hide all avatars in the area
// AMT_DISABLE_PASSPORTS — Disable clicking on avatars to see profiles
// AMT_DISABLE_JUMPING   — Prevent jumping in the area
```

## Cursor State

```typescript
// Check if cursor is locked (pointer lock mode)
const isLocked = PointerLock.get(engine.CameraEntity).isPointerLocked

// Get cursor position and world ray
const pointerInfo = PrimaryPointerInfo.get(engine.RootEntity)
console.log('Cursor screen position:', pointerInfo.screenCoordinates)
console.log('World ray direction:', pointerInfo.worldRayDirection)
```

## Trigger Area Callback Fields

The trigger area event callback provides:
- `triggeredEntity` — the entity that activated the area
- `eventType` — ENTER, EXIT, or STAY
- `trigger.entity` — the trigger area entity
- `trigger.layer` — the collider layer
- `trigger.position` — position of the triggered entity
- `trigger.rotation` — rotation of the triggered entity
- `trigger.scale` — scale of the triggered entity
