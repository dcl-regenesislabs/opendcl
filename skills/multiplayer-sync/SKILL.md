---
name: multiplayer-sync
description: Synchronize state between players in Decentraland multiplayer scenes using CRDT-based networking. Use when user wants multiplayer, sync state, network entities, shared world state, or real-time collaboration.
---

# Multiplayer Synchronization in Decentraland

Decentraland scenes are inherently multiplayer. All players in the same scene share the same space. SDK7 uses CRDT-based synchronization.

## How Sync Works

- Components on entities created via `engine.addEntity()` are **automatically synced** between all players in the scene.
- The Decentraland runtime uses CRDTs (Conflict-free Replicated Data Types) to resolve conflicts.
- Last-write-wins semantics for most components (Transform, Material, etc.).
- No server code needed — sync is built into the runtime.

## Basic Synced Entity

Any entity with standard components syncs automatically:

```typescript
import { engine, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

// This entity and all its components sync to all players
const sharedCube = engine.addEntity()
Transform.create(sharedCube, { position: Vector3.create(8, 1, 8) })
MeshRenderer.setBox(sharedCube)
Material.setPbrMaterial(sharedCube, { albedoColor: Color4.Red() })

// When any player changes the transform, all players see it
function moveCube() {
  const transform = Transform.getMutable(sharedCube)
  transform.position.x += 1  // All players see this change
}
```

## Custom Synced Components

Define custom components that sync between players:

```typescript
import { engine, Schemas } from '@dcl/sdk/ecs'

// Define a custom synced component
const ScoreBoard = engine.defineComponent('scoreBoard', {
  score: Schemas.Int,
  playerName: Schemas.String,
  lastUpdated: Schemas.Int64
})

// Use it on an entity — automatically syncs
const board = engine.addEntity()
ScoreBoard.create(board, { score: 0, playerName: '', lastUpdated: 0 })

// Update from any player
function addScore(points: number) {
  const data = ScoreBoard.getMutable(board)
  data.score += points
  data.lastUpdated = Date.now()
}
```

## Player-Specific Data

Use `PlayerIdentityData` to distinguish players:

```typescript
import { engine, PlayerIdentityData } from '@dcl/sdk/ecs'

engine.addSystem(() => {
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const data = PlayerIdentityData.get(entity)
    console.log('Player:', data.address, 'Guest:', data.isGuest)
  }
})
```

## Schema Types

Available schema types for custom components:

| Type | Usage |
|------|-------|
| `Schemas.Boolean` | true/false |
| `Schemas.Int` | Integer numbers |
| `Schemas.Float` | Decimal numbers |
| `Schemas.String` | Text strings |
| `Schemas.Int64` | Large integers (timestamps) |
| `Schemas.Vector3` | 3D coordinates |
| `Schemas.Quaternion` | Rotations |
| `Schemas.Color3` | RGB colors |
| `Schemas.Color4` | RGBA colors |
| `Schemas.Entity` | Entity reference |
| `Schemas.Array(innerType)` | Array of values |
| `Schemas.Map(valueType)` | Key-value maps |
| `Schemas.Optional(innerType)` | Nullable values |
| `Schemas.Enum(enumType)` | Enum values |

## Communication Patterns

### Global State (Shared Object)
```typescript
// One entity holds shared game state
const gameState = engine.addEntity()
const GameState = engine.defineComponent('gameState', {
  phase: Schemas.String,
  timeRemaining: Schemas.Int,
  isActive: Schemas.Boolean
})
GameState.create(gameState, { phase: 'waiting', timeRemaining: 60, isActive: false })
```

### Per-Player State
```typescript
// Track each player's state separately using their entity
engine.addSystem(() => {
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    // Each player's entity is unique to them
    // Attach custom components to player entities for per-player data
  }
})
```

## Important Notes

- **All component changes sync automatically** — no explicit "send" calls needed
- **CRDT resolution**: If two players change the same component simultaneously, last-write-wins
- **No server-side code**: Decentraland scenes run entirely client-side with CRDT sync
- **Entity limits apply**: Each synced entity counts toward the scene's entity budget
- **Custom schemas must be deterministic**: Same component name = same schema across all clients
- For complex multiplayer logic (authoritative game servers), consider using Decentraland's WebSocket libraries
