---
name: player-avatar
description: Player and avatar system in Decentraland. Read player position/profile, customize appearance (AvatarBase), trigger emotes (triggerEmote/triggerSceneEmote), read equipped wearables (AvatarEquippedData), attach objects to players (AvatarAttach), create NPC avatars (AvatarShape), avatar modifier areas, locomotion settings, and restrict player movement (InputModifier). Use when the user wants player data, emotes, wearables, NPC avatars, avatar attachments, movement speed changes, or freezing/disabling player controls. Do NOT use for wallet/blockchain interactions (see nft-blockchain).
---

# Player and Avatar System in Decentraland

## Player Position and Movement

Access the player's position via the reserved `engine.PlayerEntity`:

```typescript
import { engine, Transform } from '@dcl/sdk/ecs'

function trackPlayer() {
	if (!Transform.has(engine.PlayerEntity)) return

	const playerTransform = Transform.get(engine.PlayerEntity)
	console.log('Player position:', playerTransform.position)
	console.log('Player rotation:', playerTransform.rotation)
}

engine.addSystem(trackPlayer)
```

### Distance-Based Logic

```typescript
import { Vector3 } from '@dcl/sdk/math'

function proximityCheck() {
	const playerPos = Transform.get(engine.PlayerEntity).position
	const npcPos = Transform.get(npcEntity).position
	const distance = Vector3.distance(playerPos, npcPos)

	if (distance < 5) {
		console.log('Player is near the NPC')
	}
}

engine.addSystem(proximityCheck)
```

## Player Profile Data

Get the player's name, wallet address, and guest status:

```typescript
import { getPlayer } from '@dcl/sdk/src/players'

function main() {
	const player = getPlayer()
	if (player) {
		console.log('Name:', player.name)
		console.log('User ID:', player.userId)
		console.log('Is guest:', player.isGuest)
	}
}
```

- `userId` — the player's Ethereum wallet address (or guest ID)
- `isGuest` — `true` if the player hasn't connected a wallet

## Avatar Attachments

Attach 3D objects to a player's avatar:

```typescript
import {
	engine,
	Transform,
	GltfContainer,
	AvatarAttach,
	AvatarAnchorPointType,
} from '@dcl/sdk/ecs'

const hat = engine.addEntity()
GltfContainer.create(hat, { src: 'models/hat.glb' })
Transform.crete(hat, {})

// Attach to the local player's avatar
AvatarAttach.create(hat, {
	anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG,
})
```

### Anchor Points

```typescript
AvatarAnchorPointType.AAPT_NAME_TAG // Above the head
AvatarAnchorPointType.AAPT_RIGHT_HAND // Right hand
AvatarAnchorPointType.AAPT_LEFT_HAND // Left hand
AvatarAnchorPointType.AAPT_POSITION // Avatar root position
AvatarAnchorPointType.AAPT_HEAD
AvatarAnchorPointType.AAPT_NECK
AvatarAnchorPointType.AAPT_SPINE
AvatarAnchorPointType.AAPT_SPINE1
AvatarAnchorPointType.AAPT_SPINE2
AvatarAnchorPointType.AAPT_HIP
AvatarAnchorPointType.AAPT_LEFT_SHOULDER
AvatarAnchorPointType.AAPT_LEFT_ARM
AvatarAnchorPointType.AAPT_LEFT_FOREARM
AvatarAnchorPointType.AAPT_LEFT_HAND_INDEX
AvatarAnchorPointType.AAPT_RIGHT_SHOULDER
AvatarAnchorPointType.AAPT_RIGHT_ARM
AvatarAnchorPointType.AAPT_RIGHT_FOREARM
AvatarAnchorPointType.AAPT_RIGHT_HAND_INDEX
AvatarAnchorPointType.AAPT_LEFT_UP_LEG
AvatarAnchorPointType.AAPT_LEFT_LEG
AvatarAnchorPointType.AAPT_LEFT_FOOT
AvatarAnchorPointType.AAPT_LEFT_TOE_BASE
AvatarAnchorPointType.AAPT_RIGHT_UP_LEG
AvatarAnchorPointType.AAPT_RIGHT_LEG
AvatarAnchorPointType.AAPT_RIGHT_FOOT
AvatarAnchorPointType.AAPT_RIGHT_TOE_BASE
AvatarAnchorPointType.AAPT_NAME_TAG
```

### Attach to a Specific Player

```typescript
AvatarAttach.create(hat, {
	avatarId: '0x123...abc', // Target player's wallet address
	anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND,
})
```

## Triggering Emotes

### Default Emotes

```typescript
import { triggerEmote } from '~system/RestrictedActions'

// Play a built-in emote
triggerEmote({ predefinedEmote: 'robot' })
triggerEmote({ predefinedEmote: 'wave' })
triggerEmote({ predefinedEmote: 'clap' })
```

### Custom Scene Emotes

```typescript
import { triggerSceneEmote } from '~system/RestrictedActions'

// Play a custom emote animation (file must end with _emote.glb)
triggerSceneEmote({
	src: 'animations/Snowball_Throw_emote.glb',
	loop: false,
})
```

**Notes:**

- Emotes play only while the player is standing still — walking or jumping interrupts them
- If you don't want a player to interrupt an emote, use the `InputModifier` component to freeze the player for the duration of the emote
- Custom emote files must have the `_emote.glb` suffix

## NPC Avatars

Create avatar-shaped NPCs using `AvatarShape`:

```typescript
import { engine, Transform, AvatarShape } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const npc = engine.addEntity()
Transform.create(npc, { position: Vector3.create(8, 0, 8) })

AvatarShape.create(npc, {
	id: 'npc-1',
	name: 'Guard',
	bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale', // or BaseFemale
	wearables: [
		'urn:decentraland:off-chain:base-avatars:eyebrows_00',
		'urn:decentraland:off-chain:base-avatars:mouth_00',
		'urn:decentraland:off-chain:base-avatars:eyes_00',
		'urn:decentraland:off-chain:base-avatars:blue_tshirt',
		'urn:decentraland:off-chain:base-avatars:brown_pants',
		'urn:decentraland:off-chain:base-avatars:classic_shoes',
		'urn:decentraland:off-chain:base-avatars:short_hair',
	],
	hairColor: { r: 0.92, g: 0.76, b: 0.62 }, // RGB values 0-1
	skinColor: { r: 0.94, g: 0.85, b: 0.6 }, // RGB values 0-1
	emotes: [],
})
```

Use the expressionTriggerTimestamp to replay a same emote on an NPC. The value of this field is a lamport timestamp, meaning that it's not a time value, but rather an index that is raised by 1 for each repetition of the emote.

So the first time you play an emote, you set expressionTriggerTimestamp to 0. To play the emote again, you must update this value to 1. That's how the engine knows that this is a new instruction, and not an instruction it already acted upon.

If you change the Transform position of an entity with an `AvatarShape` component, it will walk or run to this new position depending on the distance, it won't instantly teleport in one frame.

### Mannequin (Show Only Wearables)

Display just the wearables without a full avatar body:

```typescript
AvatarShape.create(mannequin, {
	id: 'mannequin-1',
	name: 'Display',
	wearables: [
		'urn:decentraland:matic:collections-v2:0x90e5cb2d673699be8f28d339c818a0b60144c494:0',
	],
	show_only_wearables: true,
})
```

## Avatar Modifier Areas

Modify how avatars appear or behave in a region.

```typescript
import {
	engine,
	Transform,
	AvatarModifierArea,
	AvatarModifierType,
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const modifierArea = engine.addEntity()
Transform.create(modifierArea, {
	position: Vector3.create(8, 1.5, 8),
	scale: Vector3.create(4, 3, 4),
})

AvatarModifierArea.create(modifierArea, {
	area: { box: Vector3.create(4, 3, 4) },
	modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
	excludeIds: ['0x123...abc'], // Optional: exclude specific players
})
```

### Available Modifiers

```typescript
AvatarModifierType.AMT_HIDE_AVATARS // Hide all avatars in the area
AvatarModifierType.AMT_DISABLE_PASSPORTS // Disable clicking on avatars to see profiles
```

## Avatar Locomotion Settings

Adjust the player's movement speed and jump height:

```typescript
import { engine, AvatarLocomotionSettings } from '@dcl/sdk/ecs'

// Modify run speed and jump height
AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
	runSpeed: 8, // default is ~6
	jumpHeight: 3, // default is ~1.5
})
```

## Restrict Locomotion (InputModifier)

Use `InputModifier` on `engine.PlayerEntity` to freeze the player or selectively disable movement types. This is useful for cutscenes, locked interactions, or game mechanics where movement should be controlled.

### Freeze All Movement

```typescript
import { InputModifier, engine } from '@dcl/sdk/ecs'

InputModifier.create(engine.PlayerEntity, {
	mode: InputModifier.Mode.Standard({
		disableAll: true,
	}),
})
```

**Behavior when frozen:**

- Gravity and external forces (moving platforms) still apply
- Camera rotation remains available
- Global input events are still detectable by the scene
- Players cannot voluntarily trigger emotes, but scenes can still trigger animations
- Restrictions are automatically lifted when the player leaves the scene bounds

### Disable Specific Movement Types

```typescript
import { InputModifier, engine } from '@dcl/sdk/ecs'

InputModifier.create(engine.PlayerEntity, {
	mode: InputModifier.Mode.Standard({
		disableAll: false,
		disableWalk: false,
		disableRun: true,
		disableJog: true,
		disableJump: true,
		disableEmote: true,
		disableDoubleJump: true,
		disableGliding: true,
	}),
})
```

Available flags: `disableAll`, `disableWalk`, `disableRun`, `disableJog`, `disableJump`, `disableEmote`, `disableDoubleJump`, `disableGliding`.

### Remove Restrictions

```typescript
InputModifier.deleteFrom(engine.PlayerEntity)
```

Or update with all flags set to `false`:

```typescript
InputModifier.createOrReplace(engine.PlayerEntity, {
	mode: InputModifier.Mode.Standard({ disableAll: false }),
})
```

> **Tip:** Combine with `triggerSceneEmote` to play an animation while the player is frozen — use `InputModifier` with `disableAll: true` for the emote duration, then remove it when the emote ends.

## Teleporting the Player

**You MUST use `movePlayerTo` from `~system/RestrictedActions` to move or teleport the player.** Setting `Transform.getMutable(engine.PlayerEntity).position` does NOT work — the runtime ignores direct writes to the player transform.

`movePlayerTo` accepts:

- `newRelativePosition` — where to move the player (scene-relative `Vector3`)
- `cameraTarget` _(optional)_ — a point in space for the camera to face after moving
- `avatarTarget` _(optional)_ — a point in space for the avatar to face after moving
- `duration` _(optional)_ — transition time in seconds; if provided, movement can be awaited

**Constraints:**

- The player must already be inside the scene's bounds for this to work
- The target position must also be within the scene's bounds
- During the transition the avatar passes through colliders

### Instant teleport

```typescript
import { movePlayerTo } from '~system/RestrictedActions'

void movePlayerTo({
	newRelativePosition: Vector3.create(8, 0, 8),
	cameraTarget: Vector3.create(8, 1, 12),
	avatarTarget: Vector3.create(8, 1, 12),
})
```

### Smooth transition with duration

When `duration` is set, `movePlayerTo` is awaitable. The resolved value has a `success` boolean — `false` if the player interrupted the movement with input.

```typescript
import { movePlayerTo } from '~system/RestrictedActions'

async function teleport() {
	const result = await movePlayerTo({
		newRelativePosition: Vector3.create(1, 0, 1),
		cameraTarget: Vector3.create(8, 1, 8),
		duration: 2,
	})
	if (!result.success) {
		console.log('Movement was interrupted by the player')
	}
}
```

### Prevent the player from interrupting a transition

Combine `InputModifier` with `movePlayerTo` to lock movement for the duration:

```typescript
import { movePlayerTo } from '~system/RestrictedActions'
import { InputModifier, engine } from '@dcl/sdk/ecs'

async function lockedTeleport() {
	InputModifier.create(engine.PlayerEntity, {
		mode: InputModifier.Mode.Standard({ disableAll: true }),
	})

	await movePlayerTo({
		newRelativePosition: Vector3.create(1, 0, 1),
		cameraTarget: Vector3.create(8, 1, 8),
		duration: 2,
	})

	InputModifier.deleteFrom(engine.PlayerEntity)
}
```

### Avatar Change Listeners

React to avatar changes in real-time:

```typescript
import {
	AvatarEmoteCommand,
	AvatarBase,
	AvatarEquippedData,
} from '@dcl/sdk/ecs'

// Detect when any player triggers an emote
AvatarEmoteCommand.onChange(engine.PlayerEntity, (cmd) => {
	if (cmd) console.log('Emote played:', cmd.emoteUrn)
})

// Detect avatar appearance changes (wearables, skin color, etc.)
AvatarBase.onChange(engine.PlayerEntity, (base) => {
	if (base) console.log('Avatar name:', base.name)
})

// Detect equipment changes
AvatarEquippedData.onChange(engine.PlayerEntity, (equipped) => {
	if (equipped) console.log('Wearables changed:', equipped.wearableUrns)
})
```

### Additional Anchor Points

Beyond the commonly used anchor points, the full list includes:

- `AvatarAnchorPointType.AAPT_POSITION` — avatar feet position
- `AvatarAnchorPointType.AAPT_NAME_TAG` — above the name tag
- `AvatarAnchorPointType.AAPT_LEFT_HAND` / `AAPT_RIGHT_HAND`
- `AvatarAnchorPointType.AAPT_HEAD` — head bone
- `AvatarAnchorPointType.AAPT_NECK` — neck bone

> **Need to check the player's wallet before showing avatar items?** See the **nft-blockchain** skill for wallet checks with `getPlayer()` and `isGuest`.

## Best Practices

- Always check `Transform.has(engine.PlayerEntity)` before reading player data — it may not be ready on the first frame
- Use `getPlayer()` to check `isGuest` before attempting wallet-dependent features
- `AvatarAttach` requires the target player to be in the same scene — attachments disappear when the player leaves
- Custom emote files must use the `_emote.glb` naming convention
- Use `AvatarModifierArea` with `AMT_HIDE_AVATARS` for private rooms or single-player puzzle areas
- Add `excludeIds` to modifier areas when you want specific players (like the scene owner) to remain visible
- **Never use `Transform.getMutable(engine.PlayerEntity)` to move the player** — it does not work. Always use `movePlayerTo` from `~system/RestrictedActions`
- `Transform.get(engine.PlayerEntity)` is valid for **reading** position only

For component field details, see `{baseDir}/../../context/components-reference.md`.
For full AvatarShape fields, wearable URNs, anchor points, emote names, and event callbacks, see `{baseDir}/references/avatar-apis.md`.
