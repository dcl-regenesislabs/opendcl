---
name: game-design
description: Plan and design Decentraland games and interactive experiences. Scene limit formulas, performance budgets, texture requirements, asset preloading, state management patterns (module-level, component-based, state machines), object pooling, UX/UI guidelines, input design, and MVP planning. Use when the user wants game design advice, scene architecture, performance planning, or help structuring a game. Do NOT use for specific implementation (see add-interactivity, build-ui, multiplayer-sync).
---

# Decentraland Game Design & Scene Optimization

## 1. DCL Game Design Philosophy

Decentraland is a **continuous, shared 3D world**. Design around these constraints:

- **No startup screen**: The scene is always live. Players walk in from adjacent parcels — there is no splash screen, no "press start." Your scene must be meaningful the instant a player arrives.
- **No forced endings**: You cannot force a "game over" state. Players can leave at any time by walking away or teleporting. Design loops that accommodate drop-in / drop-out naturally.
- **Cannot remove players**: There is no API to eject a player from a scene. You can teleport a player, but only with their consent (they must accept the prompt). Design around misbehaving players with game mechanics, not eviction.
- **Boundary awareness**: Players standing outside your parcel can see into it. Your scene is always on display. Neighboring scenes are visible too — consider visual harmony.
- **Shared space**: Multiple players are always potentially present. Even a "single-player" puzzle is witnessed by others. Embrace or account for this.

## 2. Scene Limitation Formulas

All limits scale with parcel count `n`. Know these formulas and design within them.

| Resource | Formula | 1 parcel | 2 parcels | 4 parcels | 9 parcels | 16 parcels |
|---|---|---|---|---|---|---|
| **Triangles** | n x 10,000 | 10,000 | 20,000 | 40,000 | 90,000 | 160,000 |
| **Entities** | n x 200 | 200 | 400 | 800 | 1,800 | 3,200 |
| **Physics bodies** | n x 300 | 300 | 600 | 1,200 | 2,700 | 4,800 |
| **Materials** | log2(n+1) x 20 | 20 | 31 | 46 | 66 | 81 |
| **Textures** | log2(n+1) x 10 | 10 | 15 | 23 | 33 | 40 |
| **Height limit** | log2(n+1) x 20m | 20m | 31m | 46m | 66m | 81m |
| **Draw calls** | n x 300 (target) | 300 | 600 | 1,200 | 2,700 | 4,800 |

**File limits:** 15 MB per parcel, 300 MB max total, 200 files per parcel, 50 MB max per individual file.

## 3. Texture Requirements

- **Dimensions must be power-of-two**: 256, 512, 1024, 2048
- **Recommended sizes**: 1024x1024 for scene objects, 512x512 for wearables
- **Avoid textures over 2048x2048** — they consume excessive memory and often exceed limits
- **Use texture atlases** to combine multiple small textures into one, reducing draw calls and material count
- Prefer compressed formats (WebP) over raw PNG where possible
- Share texture references across materials — do not duplicate texture files

## 4. Asset Preloading (AssetLoad Component)

For large assets that would cause visible pop-in, use `AssetLoad` to pre-download before rendering:

```typescript
import { engine, AssetLoad, LoadingState, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const preloadEntity = engine.addEntity()
AssetLoad.create(preloadEntity, { src: 'models/large-model.glb' })

function assetLoadingSystem(dt: number) {
  for (const [entity] of engine.getEntitiesWith(AssetLoad)) {
    const state = AssetLoad.get(entity)
    if (state.loadingState === LoadingState.FINISHED) {
      GltfContainer.create(entity, { src: 'models/large-model.glb' })
      Transform.create(entity, { position: Vector3.create(8, 0, 8) })
      AssetLoad.deleteFrom(entity)
    }
  }
}
engine.addSystem(assetLoadingSystem)
```

Use this pattern for any model over ~1 MB or for assets that should be ready before a game phase begins.

## 5. Performance Patterns

### Object Pooling
Reuse entities instead of creating and destroying them:

```typescript
const pool: Entity[] = []

function getFromPool(): Entity {
  const existing = pool.pop()
  if (existing) return existing
  return engine.addEntity()
}

function returnToPool(entity: Entity) {
  Transform.getMutable(entity).position = Vector3.create(0, -100, 0)
  pool.push(entity)
}
```

### LOD (Level of Detail)
Swap models or hide entities based on distance from the player:

```typescript
function lodSystem() {
  const playerPos = Transform.get(engine.PlayerEntity).position
  for (const [entity, transform] of engine.getEntitiesWith(Transform, GltfContainer)) {
    const distance = Vector3.distance(playerPos, transform.position)
    VisibilityComponent.createOrReplace(entity, { visible: distance <= 30 })
  }
}
engine.addSystem(lodSystem)
```

### Draw Call Reduction
- Merge meshes in Blender before export
- Use texture atlases (one material for many objects)
- Limit unique materials — reuse them across entities
- Avoid transparency when possible (transparent objects cost extra draw calls)

### System Optimization
- Do NOT run heavy logic every frame. Use timers:
  ```typescript
  let timer = 0
  function heavySystem(dt: number) {
    timer += dt
    if (timer < 0.5) return // Run every 500ms, not every frame
    timer = 0
    // ... expensive work here
  }
  ```
- Minimize `engine.getEntitiesWith()` queries — cache results when entity sets are stable
- Avoid allocating new objects (Vector3.create, arrays) inside systems that run every frame

### Disable Unused Colliders
Remove collision meshes from decorative objects that players never interact with. This reduces physics body count significantly.

## 6. Input System Design

| Input | Action | Notes |
|---|---|---|
| **E key** | Primary action (`IA_PRIMARY`) | Main interaction |
| **F key** | Secondary action (`IA_SECONDARY`) | Alternate interaction |
| **Pointer click** | `IA_POINTER` | Left mouse click / tap |
| **Keys 1-4** | `IA_ACTION_3` through `IA_ACTION_6` | Action bar slots |

### Design Considerations
- Mouse wheel is **not available** as an input
- Always design for both **desktop and mobile**. Mobile has no keyboard — rely on pointer and on-screen buttons
- Set `maxDistance` on pointer events (8-10 meters typical) to prevent interactions from across the scene
- Use `hoverText` to communicate what an interaction does before the player commits

## 7. State Management Patterns

### Module-Level State (Simple Games)
```typescript
// game-state.ts
export let score = 0
export let gamePhase: 'waiting' | 'playing' | 'ended' = 'waiting'
export function addScore(points: number) { score += points }
```

### Component-Based State (Complex Games)
Use custom components as structured data containers:
```typescript
import { engine, Schemas } from '@dcl/sdk/ecs'

const EnemyState = engine.defineComponent('EnemyState', {
  health: Schemas.Number,
  speed: Schemas.Number,
  target: Schemas.Entity
})
```

### State Machines
Model game phases as explicit states with clear transitions:
```typescript
type GameState = 'lobby' | 'countdown' | 'active' | 'cooldown'
let currentState: GameState = 'lobby'

function gameStateSystem(dt: number) {
  switch (currentState) {
    case 'lobby': handleLobby(dt); break
    case 'countdown': handleCountdown(dt); break
    case 'active': handleActive(dt); break
    case 'cooldown': handleCooldown(dt); break
  }
}
```

## 8. UX/UI Guidelines

- **Keep UI minimal**: The metaverse is about 3D presence, not 2D overlays. Avoid large HUDs that obscure the world.
- **Prefer spatial UI**: Use `TextShape` on entities and 3D signs over screen-space UI whenever the information is tied to a place or object.
- **Clear affordances**: Interactive objects should look interactive. Use glow effects, outlines, floating indicators, or subtle animations to signal "you can click this."
- **Sound feedback**: Every significant player action should produce audio feedback. It confirms the action registered and adds polish.
- **Progressive disclosure**: Do not dump all information at once. Reveal mechanics and story as the player engages. Start simple, layer complexity.
- **Immediate feedback**: When a player interacts, respond within the same frame. Use tweens, sounds, or UI popups so the player never wonders "did that work?"
- **Accessibility**: Use high-contrast text, readable font sizes (fontSize >= 16 for screen UI), and audio cues alongside visual ones.

## 9. MVP Planning

### Start with the Core Loop
Ask: **What does the player DO?** The answer should be a single sentence:
- "The player explores rooms and finds hidden objects."
- "The player races other players through an obstacle course."
- "The player collects resources and builds structures."

### Prototype Fast
- Build in **1-2 parcels** first, even if the final scene will be larger
- Use primitive shapes (boxes, spheres) as placeholders — do not wait for final art
- Get the core loop working before adding any secondary features

### Test Early
- Deploy to a test world and walk through it yourself
- Invite 2-3 real players and watch them (do not explain the game — see if it is self-explanatory)
- Measure: Do players understand what to do within 30 seconds?

### Iterate on Fun
- Polish comes last. If the core loop is not fun with placeholder art, better art will not fix it
- Cut features aggressively. A tight, small experience beats a sprawling, unfinished one
- Replay value matters more than content volume in DCL (players return to scenes they enjoy)

### MVP Checklist
- Core loop is playable in under 60 seconds
- Works with 1 player and with 5+ players simultaneously
- Fits within scene limits for target parcel count
- Has clear visual/audio feedback for all interactions
- Player understands the goal without external instructions

> **Starting from scratch?** See the **create-scene** skill first to scaffold the project before designing the game.

## 10. Cross-References

| Topic | Skill | When to Use |
|---|---|---|
| Interactivity, input handling, raycasting | **add-interactivity** | Implementing click handlers, triggers, input |
| Multiplayer sync, server communication | **multiplayer-sync** | Networked game state, real-time sync |
| Screen UI, React-ECS, HUD elements | **build-ui** | Building menus, scoreboards, dialogs |
| Performance optimization, entity/triangle budgets | **optimize-scene** | Detailed optimization techniques |

This skill focuses on the **design decisions and optimization constraints** that shape implementations. For detailed code patterns, see the referenced skills.
