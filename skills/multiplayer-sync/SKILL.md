---
name: multiplayer-sync
description: Synchronize state between players in Decentraland using CRDT networking (syncEntity), MessageBus, fetch, signedFetch, and WebSocket. Use when the user wants multiplayer, synced entities, shared world state, real-time networking, or player-to-player communication. Do NOT use for server-authoritative multiplayer with anti-cheat (see authoritative-server). Do NOT use for screen UI (see build-ui).
---

# Multiplayer Synchronization in Decentraland

Decentraland scenes are inherently multiplayer. All players in the same scene share the same space. SDK7 uses CRDT-based synchronization.

> **Runtime constraint:** Decentraland runs in a QuickJS sandbox. No Node.js APIs (`fs`, `http`, `path`, `process`). Use `fetch()` and `WebSocket` for network communication. See the **scene-runtime** skill for async patterns.

## Sync Strategy Decision Tree

Choose the right networking approach based on what you need:

| Strategy | Use When | Persistence | Example |
|----------|----------|-------------|---------|
| `syncEntity` | Shared state that all players see and that persists for new arrivals | Yes — state survives player join/leave | Doors, switches, scoreboards, elevators |
| `MessageBus` | Ephemeral events that only matter in the moment | No — late joiners miss past messages | Chat messages, sound effects, particle triggers |
| `fetch` / REST API | Reading or writing data to an external server | Server-dependent | Leaderboards, inventory, external game state |
| `signedFetch` | Authenticated requests that prove player identity | Server-dependent | Claiming rewards, submitting verified scores |
| `WebSocket` | Real-time bidirectional communication with a server | Connection-dependent | Live game servers, real-time chat, authoritative multiplayer |

**Decision flow:**
1. Does every player need to see the same state, including late joiners? --> `syncEntity`
2. Is it a fire-and-forget event only for players currently in the scene? --> `MessageBus`
3. Do you need to talk to an external server? --> `fetch` or `signedFetch`
4. Do you need continuous real-time server communication? --> `WebSocket`
5. Combine approaches freely: use `syncEntity` for world state, `MessageBus` for effects, and `fetch` for persistence.

---

## syncEntity Essentials

### Import and Basic Usage

```typescript
import { engine, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Vector3, Color4 } from '@dcl/sdk/math'
```

Signature: `syncEntity(entity, componentIds[], syncId?)`

- `entity` — the entity to synchronize
- `componentIds[]` — array of component IDs to keep in sync (e.g., `[Transform.componentId]`)
- `syncId` — unique numeric identifier (required for predefined entities, optional for player-spawned entities)

### Enum Sync IDs (Predefined Entities)

Every predefined synced entity MUST have a unique numeric ID. Use an enum to avoid collisions:

```typescript
enum SyncIds {
  DOOR = 1,
  ELEVATOR = 2,
  SCOREBOARD = 3
}

const door = engine.addEntity()
Transform.create(door, { position: Vector3.create(8, 1, 8) })
MeshRenderer.setBox(door)
syncEntity(door, [Transform.componentId, MeshRenderer.componentId], SyncIds.DOOR)
```

Predefined entities (with a sync ID) persist after the creating player leaves. Player-created entities (no sync ID) are removed when the player disconnects.

### Auto-Generated IDs (Player-Spawned Entities)

Entities created at runtime by players do not need an explicit sync ID:

```typescript
function createProjectile() {
  const projectile = engine.addEntity()
  Transform.create(projectile, { position: Vector3.create(4, 1, 4) })
  MeshRenderer.setSphere(projectile)
  syncEntity(projectile, [Transform.componentId])
  return projectile
}
```

## Custom Synced Components

Define custom components and sync them between players:

```typescript
import { engine, Schemas } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

const ScoreBoard = engine.defineComponent('scoreBoard', {
  score: Schemas.Int,
  playerName: Schemas.String,
  lastUpdated: Schemas.Int64
})

const board = engine.addEntity()
ScoreBoard.create(board, { score: 0, playerName: '', lastUpdated: 0 })
syncEntity(board, [ScoreBoard.componentId])

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

## Parent-Child Sync Relationships

For synced entities with parent-child relationships, use `parentEntity()` instead of setting `Transform.parent`:

```typescript
import { syncEntity, parentEntity, getParent, getChildren, removeParent } from '@dcl/sdk/network'

const parent = engine.addEntity()
const child = engine.addEntity()

syncEntity(parent, [Transform.componentId], 1)
syncEntity(child, [Transform.componentId], 2)

// Use parentEntity() — NOT Transform.parent
parentEntity(child, parent)

const parentRef = getParent(child)
const childrenArray = Array.from(getChildren(parent))

// Remove parent relationship
removeParent(child)
```

## Connection State

Check if the player is connected to the sync room:

```typescript
import { isStateSyncronized } from '@dcl/sdk/network'

engine.addSystem(() => {
  if (!isStateSyncronized()) return // wait for sync
  // safe to read/write synced state
})
```

**Note:** The function is spelled `isStateSyncronized` (not "Synchronized") in the SDK.

---

## MessageBus

Send custom messages between players (fire-and-forget, no persistence):

```typescript
import { MessageBus } from '@dcl/sdk/message-bus'

const bus = new MessageBus()

bus.on('hit', (data: { damage: number }) => {
  console.log('Took damage:', data.damage)
})

bus.emit('hit', { damage: 10 })
```

### syncEntity vs MessageBus

- `syncEntity`: state is persistent, late joiners get current state, automatic conflict resolution
- `MessageBus`: fire-and-forget, late joiners miss past messages, good for transient effects
- Combine both: use `syncEntity` for the door open/closed state, `MessageBus` for the sound effect when it opens

---

## REST API Calls (fetch)

All network calls must run inside `executeTask` because the SDK runtime does not support top-level await.

```typescript
import { executeTask } from '@dcl/sdk/ecs'

executeTask(async () => {
  try {
    const response = await fetch('https://api.example.com/data')
    if (!response.ok) {
      console.error('HTTP error:', response.status)
      return
    }
    const data = await response.json()
    console.log('Response:', data)
  } catch (error) {
    console.error('Network error:', error)
  }
})
```

## Signed Fetch (Authenticated Requests)

`signedFetch` attaches a cryptographic signature proving the player's identity:

```typescript
import { signedFetch } from '~system/SignedFetch'

executeTask(async () => {
  try {
    const response = await signedFetch({
      url: 'https://example.com/api/action',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claimReward', amount: 100 })
      }
    })
    if (!response.ok) {
      console.error('HTTP error:', response.status)
      return
    }
    const result = JSON.parse(response.body)
    console.log('Result:', result)
  } catch (error) {
    console.log('Request failed:', error)
  }
})
```

---

## WebSocket Connections

For full WebSocket patterns (reconnection, heartbeat, message format), see `{baseDir}/references/networking-patterns.md`.

### Basic Connection

```typescript
executeTask(async () => {
  const ws = new WebSocket('wss://example.com/ws')

  ws.onopen = () => {
    console.log('Connected to WebSocket')
    ws.send(JSON.stringify({ type: 'join', playerId: 'player123' }))
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    switch (msg.type) {
      case 'gameState': handleGameState(msg); break
      case 'playerJoin': handlePlayerJoin(msg); break
      case 'playerLeave': handlePlayerLeave(msg); break
    }
  }

  ws.onerror = (error) => console.error('WebSocket error:', error)
  ws.onclose = () => console.log('Disconnected')
})
```

---

## Player Enter/Leave Events

Detect players entering or leaving the scene:

```typescript
import { onEnterScene, onLeaveScene } from '@dcl/sdk/src/players'

onEnterScene((player) => {
  console.log('Player entered:', player.userId)
})
onLeaveScene((userId) => {
  console.log('Player left:', userId)
})
```

## Multiplayer Testing

Open multiple browser windows to test multiplayer locally. Each window is a separate player.

### Offline Mode

For Decentraland Worlds that do not need multiplayer:

```json
{
  "worldConfiguration": {
    "fixedAdapter": "offline:offline"
  }
}
```

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| State not syncing between players | Missing `syncEntity()` call | Every entity you want shared must call `syncEntity(entity, [ComponentId1, ComponentId2])` |
| Sync ID collision | Two entities share the same numeric sync ID | Use an enum to assign unique IDs to every predefined synced entity |
| Entity disappears when creator leaves | No sync ID provided | Add a sync ID (third argument) to `syncEntity()` for entities that should persist |
| `Date.now()` values corrupted | Using `Schemas.Number` for timestamps | Use `Schemas.Int64` for any number over 13 digits (like `Date.now()`) |
| State not ready on join | Reading synced state before sync completes | Guard with `if (!isStateSyncronized()) return` in your system |
| MessageBus messages lost | Late joiner expecting past messages | MessageBus is fire-and-forget. Use `syncEntity` for persistent state |

> **Need server-side validation or anti-cheat?** See the **authoritative-server** skill for the headless server pattern.

## Important Notes

- **Entities must be explicitly synced** via `syncEntity(entity, [componentIds])` — pass the `componentId` of each component to sync
- **CRDT resolution**: If two players change the same component simultaneously, last-write-wins
- **No server-side code**: Decentraland scenes run entirely client-side with CRDT sync
- **Entity limits apply**: Each synced entity counts toward the scene's entity budget
- **Custom schemas must be deterministic**: Same component name = same schema across all clients
- **Use `Schemas.Int64` for timestamps**: `Schemas.Number` corrupts large numbers (13+ digits). Always use `Schemas.Int64` for values like `Date.now()`
- For server-authoritative multiplayer with validation and anti-cheat, see the `authoritative-server` skill
