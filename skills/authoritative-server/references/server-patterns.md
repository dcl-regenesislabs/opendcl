# Authoritative Server Patterns Reference

## Complete Server Setup

### Project Structure

```
src/
├── index.ts              # Entry point — isServer() branching
├── client/
│   ├── setup.ts          # Client init, input handlers, message senders
│   └── ui.tsx            # React ECS UI (reads synced state, sends messages)
├── server/
│   ├── server.ts         # Server init, game loop, message handlers
│   └── gameState.ts      # Server state management
└── shared/
    ├── schemas.ts        # Custom component definitions + validateBeforeChange
    └── messages.ts       # Message definitions via registerMessages()
```

### Entry Point (index.ts)

```typescript
import { isServer } from '@dcl/sdk/network'

export async function main() {
  if (isServer()) {
    const { initServer } = await import('./server/server')
    initServer()
    return
  }

  const { initClient } = await import('./client/setup')
  const { setupUi } = await import('./client/ui')
  initClient()
  setupUi()
}
```

### Shared Schemas (shared/schemas.ts)

```typescript
import { engine, Schemas, Entity } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// Custom synced component
export const GameState = engine.defineComponent('game:State', {
  phase: Schemas.String,
  score: Schemas.Int,
  timeRemaining: Schemas.Int
})

// Global validation — only server can modify
GameState.validateBeforeChange((value) => {
  return value.senderAddress === AUTH_SERVER_PEER_ID
})

// For built-in components, use per-entity validation
type ComponentWithValidation = {
  validateBeforeChange: (entity: Entity, cb: (value: { senderAddress: string }) => boolean) => void
}

export function protectServerEntity(entity: Entity, components: ComponentWithValidation[]) {
  for (const component of components) {
    component.validateBeforeChange(entity, (value) => {
      return value.senderAddress === AUTH_SERVER_PEER_ID
    })
  }
}
```

### Shared Messages (shared/messages.ts)

```typescript
import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  // Client → Server
  playerReady: Schemas.Map({ displayName: Schemas.String }),
  playerAction: Schemas.Map({ action: Schemas.String, targetId: Schemas.Int }),

  // Server → Client
  gameStarted: Schemas.Map({ roundNumber: Schemas.Int }),
  playerScored: Schemas.Map({ playerName: Schemas.String, points: Schemas.Int }),
  gameEnded: Schemas.Map({ winnerId: Schemas.String })
}

export const room = registerMessages(Messages)
```

### Server Logic (server/server.ts)

```typescript
import { engine, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { room } from '../shared/messages'
import { GameState, protectServerEntity } from '../shared/schemas'

export function initServer() {
  // Create server-managed entities
  const stateEntity = engine.addEntity()
  GameState.create(stateEntity, { phase: 'lobby', score: 0, timeRemaining: 60 })
  protectServerEntity(stateEntity, [Transform])
  syncEntity(stateEntity, [GameState.componentId], 1)

  // Handle client messages
  room.onMessage('playerReady', (data, context) => {
    if (!context) return
    console.log(`[Server] ${data.displayName} ready (${context.from})`)
  })

  room.onMessage('playerAction', (data, context) => {
    if (!context) return
    // Validate action on server
    const playerPos = getPlayerPosition(context.from)
    if (isValidAction(data.action, playerPos)) {
      applyAction(data)
    }
  })

  // Game loop
  engine.addSystem(gameLoopSystem)
}
```

## Authentication Flow

The auth server automatically provides player identity via `PlayerIdentityData`:

```typescript
// Server reads actual player positions
engine.addSystem(() => {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const transform = Transform.getOrNull(entity)
    if (!transform) continue

    // identity.address = wallet address (verified by server)
    // transform.position = actual player position (not client-reported)
    console.log(`[Server] ${identity.address} at`, transform.position)
  }
})
```

Never trust client-reported positions. The server sees real positions via `PlayerIdentityData` + `Transform`.

## State Reconciliation

When server state diverges from client state, the server always wins:

```typescript
// Server-side: apply authoritative state
function reconcileState() {
  const state = GameState.getMutable(stateEntity)

  // Server calculates correct state
  state.timeRemaining = Math.max(0, state.timeRemaining - 1)

  if (state.timeRemaining <= 0 && state.phase === 'active') {
    state.phase = 'ended'
    room.send('gameEnded', { winnerId: findWinner() })
  }
}
```

Because `validateBeforeChange` blocks client writes, clients can only read the state and send messages. The server is the single source of truth.

## Storage Patterns

### World Storage (Global Data)

```typescript
import { Storage } from '@dcl/sdk/server'

// Save leaderboard
await Storage.world.set('leaderboard', JSON.stringify([
  { name: 'Alice', score: 100 },
  { name: 'Bob', score: 85 }
]))

// Load leaderboard
const data = await Storage.world.get<string>('leaderboard')
const leaderboard = data ? JSON.parse(data) : []

// Delete
await Storage.world.delete('leaderboard')
```

### Player Storage (Per-Player Data)

```typescript
import { Storage } from '@dcl/sdk/server'

// Save player progress
await Storage.player.set(playerAddress, 'progress', JSON.stringify({
  level: 5,
  coins: 250,
  achievements: ['first_kill', 'speedrun']
}))

// Load player progress
const saved = await Storage.player.get<string>(playerAddress, 'progress')
const progress = saved ? JSON.parse(saved) : { level: 1, coins: 0, achievements: [] }
```

**Note:** Storage only accepts strings. Always `JSON.stringify()` objects and `String()` numbers.

**Local dev storage location:** `node_modules/@dcl/sdk-commands/.runtime-data/server-storage.json`

## Environment Variables

```typescript
import { EnvVar } from '@dcl/sdk/server'

// Read with defaults
const maxPlayers = parseInt((await EnvVar.get('MAX_PLAYERS')) || '4')
const gameDuration = parseInt((await EnvVar.get('GAME_DURATION')) || '300')
const debugMode = ((await EnvVar.get('DEBUG')) || 'false') === 'true'
```

### Local Development (.env file)

```
MAX_PLAYERS=8
GAME_DURATION=300
DEBUG=true
```

### Production Deployment

```bash
npx sdk-commands deploy-env MAX_PLAYERS --value 8
npx sdk-commands deploy-env GAME_DURATION --value 300
npx sdk-commands deploy-env OLD_VAR --delete
```

## scene.json Required Fields

```json
{
  "authoritativeMultiplayer": true,
  "worldConfiguration": {
    "name": "my-world.dcl.eth"
  },
  "logsPermissions": ["0xYourWalletAddress"]
}
```

- `authoritativeMultiplayer: true` — enables the headless server runtime
- `worldConfiguration.name` — identifies the world (required for Storage and deploy)
- `logsPermissions` — wallet addresses that can see `console.log()` from the server
