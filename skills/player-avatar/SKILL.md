---
name: player-avatar
description: Player and avatar system in Decentraland. Read player position/profile, customize appearance (AvatarBase), trigger emotes (triggerEmote/triggerSceneEmote), read equipped wearables (AvatarEquippedData), attach objects to players (AvatarAttach), create NPC avatars (AvatarShape), avatar modifier areas, and locomotion settings. Use when the user wants player data, emotes, wearables, NPC avatars, avatar attachments, or movement speed changes. Do NOT use for wallet/blockchain interactions (see nft-blockchain).
---

# Player and Avatar System in Decentraland

## Authoring split

`AvatarShape` (the component used for NPCs and pre-placed avatars) is supported in `main-entities.ts` — declare the NPC fully there with id, name, wearables, etc.:

```typescript
// main-entities.ts
shopkeeper: {
  components: {
    Transform: { position: { x: 8, y: 0, z: 8 } },
    AvatarShape: {
      id: 'shopkeeper-1',
      name: 'Shopkeeper',
      bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
      wearables: [],
      emotes: []
    }
  }
}
```

`AvatarAttach`, `AvatarModifierArea`, `AvatarBase`, `AvatarEquippedData` are **not** in the supported list — they're runtime by design (they bind to the live player, or apply to entities you create on-the-fly). Add them in `src/index.ts` and attach to entities looked up via `getEntityOrNullByName` (for static placement) or runtime-created entities (for player-bound effects).

The reserved `engine.PlayerEntity` is engine-managed and has no representation in `main-entities.ts`.

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

### Fetch Full Avatar Profile from the Catalyst

`getPlayer()` returns the local view of the player. For full avatar data (wearables list, body shape, skin/hair/eye colors), fetch from the Catalyst:

```typescript
import { executeTask, signedFetch } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/players'

executeTask(async () => {
  const player = getPlayer()
  if (!player || player.isGuest) return

  const res = await fetch(`https://peer.decentraland.org/lambdas/profiles/${player.userId}`)
  const body = await res.json()

  // Response is an array of profiles; the first entry holds the active avatar.
  const profile = body?.avatars?.[0]
  if (!profile) return

  console.log('name:', profile.name)
  console.log('wearables:', profile.avatar.wearables)
  console.log('skin color:', profile.avatar.skin.color)  // { r, g, b } — already unwrapped, NOT { color: { r,g,b } }
})
```

**Gotchas:**
- The response is `{ avatars: [...] }`, not a flat profile object. Always read `body.avatars[0]`.
- Color fields (`skin.color`, `hair.color`, `eyes.color`) are already `{ r, g, b }` objects — don't unwrap one more level.
- The fetch is unauthenticated; for endpoints that need the player's signed identity, use `signedFetch` from `@dcl/sdk/network` instead of plain `fetch`.

## Avatar Attachments

Attach 3D objects to a player's avatar:

```typescript
import { engine, Transform, GltfContainer, AvatarAttach, AvatarAnchorPointType } from '@dcl/sdk/ecs'

const hat = engine.addEntity()
GltfContainer.create(hat, { src: 'models/hat.glb' })

// Attach to the local player's avatar
AvatarAttach.create(hat, {
  anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
})
```

### Anchor Points

Full enum of bones / positions an attachment can track. Inside `main-entities.ts` use the integer value (left). In `src/index.ts` use `AvatarAnchorPointType.<NAME>`.

| value | enum | location |
|---|---|---|
| 0  | AAPT_POSITION       | avatar feet (deprecated — prefer `parent: engine.PlayerEntity`) |
| 1  | AAPT_NAME_TAG       | above the name tag |
| 2  | AAPT_LEFT_HAND      | left hand |
| 3  | AAPT_RIGHT_HAND     | right hand |
| 4  | AAPT_HEAD           | head bone |
| 5  | AAPT_NECK           | neck |
| 6  | AAPT_SPINE          | spine root |
| 7  | AAPT_SPINE1         | spine mid |
| 8  | AAPT_SPINE2         | spine top |
| 9  | AAPT_HIP            | hip |
| 10 | AAPT_LEFT_SHOULDER  | left shoulder |
| 11 | AAPT_LEFT_ARM       | left upper arm |
| 12 | AAPT_LEFT_FOREARM   | left forearm |
| 13 | AAPT_LEFT_HAND_INDEX | left index finger |
| 14 | AAPT_RIGHT_SHOULDER | right shoulder |
| 15 | AAPT_RIGHT_ARM      | right upper arm |
| 16 | AAPT_RIGHT_FOREARM  | right forearm |
| 17 | AAPT_RIGHT_HAND_INDEX | right index finger |
| 18 | AAPT_LEFT_UP_LEG    | left thigh |
| 19 | AAPT_LEFT_LEG       | left calf |
| 20 | AAPT_LEFT_FOOT      | left foot |
| 21 | AAPT_LEFT_TOE_BASE  | left toes |
| 22 | AAPT_RIGHT_UP_LEG   | right thigh |
| 23 | AAPT_RIGHT_LEG      | right calf |
| 24 | AAPT_RIGHT_FOOT     | right foot |
| 25 | AAPT_RIGHT_TOE_BASE | right toes |

### Attach to a Specific Player

```typescript
AvatarAttach.create(hat, {
  avatarId: '0x123...abc',  // Target player's wallet address
  anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
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
  loop: false
})
```

**Notes:**
- Emotes play only while the player is standing still — walking or jumping interrupts them
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
  bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',  // or BaseFemale
  wearables: [
    'urn:decentraland:off-chain:base-avatars:eyebrows_00',
    'urn:decentraland:off-chain:base-avatars:mouth_00',
    'urn:decentraland:off-chain:base-avatars:eyes_00',
    'urn:decentraland:off-chain:base-avatars:blue_tshirt',
    'urn:decentraland:off-chain:base-avatars:brown_pants',
    'urn:decentraland:off-chain:base-avatars:classic_shoes',
    'urn:decentraland:off-chain:base-avatars:short_hair'
  ],
  hairColor: { r: 0.92, g: 0.76, b: 0.62 },  // RGB values 0-1
  skinColor: { r: 0.94, g: 0.85, b: 0.6 },   // RGB values 0-1
  emotes: []
})
```

### Mannequin (Show Only Wearables)

Display just the wearables without a full avatar body:

```typescript
AvatarShape.create(mannequin, {
  id: 'mannequin-1',
  name: 'Display',
  wearables: [
    'urn:decentraland:matic:collections-v2:0x90e5cb2d673699be8f28d339c818a0b60144c494:0'
  ],
  show_only_wearables: true
})
```

NPC avatars are static — they display the avatar model but don't move or animate on their own. Combine with Animator or Tween for movement.

## Avatar Modifier Areas

Modify how avatars appear or behave in a region:

```typescript
import { engine, Transform, AvatarModifierArea, AvatarModifierType } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const modifierArea = engine.addEntity()
Transform.create(modifierArea, {
  position: Vector3.create(8, 1.5, 8),
  scale: Vector3.create(4, 3, 4)
})

AvatarModifierArea.create(modifierArea, {
  area: { box: Vector3.create(4, 3, 4) },
  modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
  excludeIds: ['0x123...abc']  // Optional: exclude specific players
})
```

### Available Modifiers

```typescript
AvatarModifierType.AMT_HIDE_AVATARS       // Hide all avatars in the area
AvatarModifierType.AMT_DISABLE_PASSPORTS  // Disable clicking on avatars to see profiles
AvatarModifierType.AMT_DISABLE_JUMPING    // Prevent jumping in the area
```

### Movement Constraints

```typescript
// Prevent jumping in a specific area
const constraintArea = engine.addEntity()
Transform.create(constraintArea, {
  position: Vector3.create(8, 5, 8),
  scale: Vector3.create(6, 10, 6)
})

AvatarModifierArea.create(constraintArea, {
  area: { box: Vector3.create(6, 10, 6) },
  modifiers: [AvatarModifierType.AMT_DISABLE_JUMPING]
})
```

## Avatar Locomotion Settings

Adjust the player's movement speed and jump height:

```typescript
import { engine, AvatarLocomotionSettings } from '@dcl/sdk/ecs'

// Modify run speed and jump height
AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
  runSpeed: 8,    // default is ~6
  jumpHeight: 3   // default is ~1.5
})
```

## InputModifier — Restrict Player Movement

Disable specific movement modes for the local player. Useful for cutscenes, dialogue freezes, traversal puzzles. Applies to `engine.PlayerEntity`.

```typescript
import { engine, InputModifier } from '@dcl/sdk/ecs'

InputModifier.createOrReplace(engine.PlayerEntity, {
  mode: InputModifier.Mode.Standard({
    disableWalk: false,
    disableJog: false,
    disableRun: false,
    disableJump: false,
    disableDoubleJump: false,
    disableGliding: false
  })
})
```

Set any field to `true` to disable that mode. While disabled:
- Gravity still applies (the player still falls).
- The camera can still rotate freely.
- The player can still trigger pointer / proximity events.
- All restrictions are auto-lifted when the player leaves the scene.

### Freeze All Movement

```typescript
InputModifier.createOrReplace(engine.PlayerEntity, {
  mode: InputModifier.Mode.Standard({ disableAll: true })
})
```

To release: `InputModifier.deleteFrom(engine.PlayerEntity)` — or `createOrReplace` with all flags `false`.

## Teleporting the Player

**You MUST use `movePlayerTo` from `~system/RestrictedActions` to move or teleport the player.** Setting `Transform.getMutable(engine.PlayerEntity).position` does NOT work — the runtime ignores direct writes to the player transform. `Transform` on `engine.PlayerEntity` is **read-only**; the same applies to `engine.CameraEntity`.

`movePlayerTo` only teleports the player **within the same scene**. Cross-scene teleports require explicit player consent and a different API.

```typescript
import { movePlayerTo } from '~system/RestrictedActions'

// Move player to a position
void movePlayerTo({
  newRelativePosition: Vector3.create(8, 0, 8)
})

// Move player with camera direction
void movePlayerTo({
  newRelativePosition: Vector3.create(8, 0, 8),
  cameraTarget: Vector3.create(8, 1, 12)
})
```

`movePlayerTo` returns a Promise — `await` it if you need to chain actions:

```typescript
import { executeTask } from '@dcl/sdk/ecs'

executeTask(async () => {
  await movePlayerTo({ newRelativePosition: Vector3.create(8, 0, 8) })
  console.log('teleported, continuing flow')
})
```

### Avatar Change Listeners

React to avatar changes in real-time:

```typescript
import { AvatarEmoteCommand, AvatarBase, AvatarEquippedData } from '@dcl/sdk/ecs'

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
- Use `AvatarModifierArea` with `AMT_HIDE_AVATARS` for private rooms or puzzle areas
- Add `excludeIds` to modifier areas when you want specific players (like the scene owner) to remain visible
- **Never use `Transform.getMutable(engine.PlayerEntity)` to move the player** — it does not work. Always use `movePlayerTo` from `~system/RestrictedActions`
- `Transform.get(engine.PlayerEntity)` is valid for **reading** position only

For component field details, see `{baseDir}/../../context/components-reference.md`.
For full AvatarShape fields, wearable URNs, anchor points, emote names, and event callbacks, see `{baseDir}/references/avatar-apis.md`.
