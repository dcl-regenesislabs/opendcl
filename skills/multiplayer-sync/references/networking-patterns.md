# Networking Patterns Reference

## WebSocket Connection Patterns

### Basic Connection

```typescript
import { executeTask } from '@dcl/sdk/ecs'

executeTask(async () => {
	const ws = new WebSocket('wss://example.com/ws')

	ws.onopen = () => {
		console.log('Connected to WebSocket')
		ws.send('Hello Server!')
	}

	ws.onmessage = (event) => {
		console.log('Received:', event.data)
	}

	ws.onerror = (error) => {
		console.error('WebSocket error:', error)
	}

	ws.onclose = () => {
		console.log('Disconnected from WebSocket')
	}
})
```

### Reconnection with Exponential Backoff

```typescript
executeTask(async () => {
	let ws: WebSocket | null = null
	let reconnectAttempts = 0
	const maxReconnectAttempts = 5

	function connect() {
		ws = new WebSocket('wss://example.com/ws')

		ws.onopen = () => {
			console.log('Connected')
			reconnectAttempts = 0
		}

		ws.onclose = () => {
			if (reconnectAttempts < maxReconnectAttempts) {
				reconnectAttempts++
				setTimeout(connect, 1000 * reconnectAttempts) // exponential backoff
			}
		}

		ws.onerror = (error) => {
			console.error('WebSocket error:', error)
		}
	}

	connect()
})
```

### Heartbeat Pattern

Send periodic pings to keep the connection alive:

```typescript
ws.onopen = () => {
	const heartbeat = setInterval(() => {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'ping' }))
		} else {
			clearInterval(heartbeat)
		}
	}, 30000) // every 30 seconds
}
```

### JSON Message Format Convention

Use a `type` field for structured communication:

```typescript
// Send
ws.send(JSON.stringify({ type: 'playerMove', position: { x: 8, y: 1, z: 8 } }))

// Receive and dispatch
ws.onmessage = (event) => {
	const msg = JSON.parse(event.data)
	switch (msg.type) {
		case 'gameState':
			handleGameState(msg)
			break
		case 'playerJoin':
			handlePlayerJoin(msg)
			break
		case 'playerLeave':
			handlePlayerLeave(msg)
			break
	}
}
```

## fetch / signedFetch Error Handling

### Robust fetch Pattern

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
		// use data
	} catch (error) {
		console.error('Network error:', error)
	}
})
```

### POST Request

```typescript
executeTask(async () => {
	try {
		const response = await fetch('https://api.example.com/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: 'player123', score: 1500 }),
		})
		const result = await response.json()
		console.log('Submission result:', result)
	} catch (error) {
		console.log('Submission failed:', error)
	}
})
```

### signedFetch for Authenticated Requests

`signedFetch` attaches a cryptographic signature proving the player's identity. Your backend can verify this signature to authenticate requests.

```typescript
import { signedFetch } from '~system/SignedFetch'

executeTask(async () => {
	try {
		const response = await signedFetch({
			url: 'https://example.com/api/claim',
			init: {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'claimReward', amount: 100 }),
			},
		})
		if (!response.ok) {
			console.error('HTTP error:', response.status)
			return
		}
		const result = JSON.parse(response.body)
		console.log('Claim result:', result)
	} catch (error) {
		console.log('Claim failed:', error)
	}
})
```

## MessageBus Typed Payloads

Define types for message data to keep code safe:

```typescript
import { MessageBus } from '@dcl/sdk/message-bus'

type SpawnMessage = {
	position: { x: number; y: number; z: number }
	entityEnumId: number
}

type ChatMessage = {
	sender: string
	text: string
	timestamp: number
}

const bus = new MessageBus()

bus.on('spawn', (message: SpawnMessage) => {
	const entity = engine.addEntity()
	Transform.create(entity, {
		position: Vector3.create(
			message.position.x,
			message.position.y,
			message.position.z
		),
	})
})

bus.on('chat', (msg: ChatMessage) => {
	console.log(`[${msg.sender}]: ${msg.text}`)
})
```

## Architecture Patterns

### Optimistic Updates

Apply changes locally immediately, then let sync propagate. With `syncEntity`, local mutations are shown instantly while the SDK handles replication:

```typescript
// Player clicks a door — update locally, sync handles the rest
Transform.getMutable(door).rotation = Quaternion.fromEulerDegrees(0, 90, 0)
```

### Authority Models

- **Decentralized (syncEntity):** Any player can mutate synced components. Good for simple shared objects.
- **Authoritative server (WebSocket):** Server validates and broadcasts state. Use for competitive games, economies, or anti-cheat.
- **Hybrid:** Use `syncEntity` for world objects, WebSocket for game logic validation.

### Multiplayer Testing

Open multiple browser windows to test multiplayer locally:

1. Use the Creator Hub Preview button multiple times (each window is a separate player)
2. Or use the URL: `decentraland://realm=http://127.0.0.1:8000&local-scene=true&debug=true`

```typescript
// Track active players
function multiplayerTestSystem() {
	const players = Array.from(engine.getEntitiesWith(PlayerIdentityData))
	console.log(`Active players: ${players.length}`)

	players.forEach(([entity, playerData]) => {
		const transform = Transform.getOrNull(entity)
		if (transform) {
			console.log(`Player ${playerData.address} at:`, transform.position)
		}
	})
}
engine.addSystem(multiplayerTestSystem)
```
