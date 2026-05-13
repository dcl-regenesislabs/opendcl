---
name: npcs
description: Create NPCs (non-player characters) in Decentraland scenes. Two approaches: the NPC Toolkit library (dcl-npc-toolkit) for GLB-based NPCs with built-in dialogue, movement, and state machines; and AvatarShape for avatar-look NPCs dressed in wearables. Use when the user wants to add an NPC, character, shopkeeper, quest giver, guard, or any non-player entity with behavior or dialogue. For live player data (position, profile, wearables) see player-avatar instead.
---

# NPCs in Decentraland

Two approaches — choose based on what the NPC needs to do:

| Approach | Use when |
|---|---|
| **NPC Toolkit** (`dcl-npc-toolkit`) | GLB model, needs dialogue, walking, state machine behavior |
| **AvatarShape** | Needs to look like a Decentraland avatar (wearables, expressions) |

## Authoring split

- **AvatarShape NPCs** are static and fully declarable in `main-entities.ts` (`AvatarShape` is in the supported component list). Click handlers / proximity systems live in `src/index.ts`.
- **NPC Toolkit NPCs** are created via `createNPC(...)` from the toolkit library, which is a runtime API — call it from `src/index.ts`. The placement entity itself (a marker for the spawn position) can still live in `main-entities.ts` if you want it editable in the gizmo.

---

## Approach 1 — NPC Toolkit (GLB-based)

The toolkit handles dialogue UI, movement along paths, animations, and interaction out of the box.

**Install:**
```bash
npm i dcl-npc-toolkit
```

**Basic usage:**
```typescript
// src/index.ts
import { createNPC, Dialog } from 'dcl-npc-toolkit'
import { Vector3, Quaternion } from '@dcl/sdk/math'

export function main() {
  const npcEntity = createNPC(
    { position: Vector3.create(8, 0, 8), rotation: Quaternion.fromEulerDegrees(0, 180, 0) },
    'models/guard.glb',
    (entity) => {
      // called when player clicks the NPC
      startDialogue(entity)
    },
    {
      idleAnim: 'Idle',
      walkingAnim: 'Walk',
      hoverText: 'Talk',
      onlyExternalTrigger: false
    }
  )
}
```

### Gotchas (NPC Toolkit)

- **Button labels are visually truncated.** Dialog button labels render with `textWrap: 'nowrap'` in a fixed-width slot (~217px at default font 16). Anything past ~15 characters is silently clipped — no ellipsis. Use short labels like `"Yes"`, `"No thanks"`, `"Tell me more"`, `"Decline"`. To fit longer text, drop `fontSize` (e.g. 12) or set `size` on the button.
- Opening dialogs on an entity not created via `createNPC` requires `addDialog(entity)` and a minimal `npcDataComponent.set(entity, ...)` — see the toolkit reference for the full setup.
- Speech bubbles need `createDialogBubble(entity)` before `talkBubble`. Bubbles do not render question buttons; questions are HUD-only.

---

## Approach 2 — AvatarShape (Decentraland avatar look)

Create an NPC that looks like a Decentraland player avatar, dressed in any wearables. **Supported in `main-entities.ts`** — declare the NPC declaratively:

```typescript
// main-entities.ts
import type { Scene } from '@dcl/sdk/scene-types'

export const scene = {
  guard: {
    components: {
      Transform: { position: { x: 8, y: 0, z: 8 } },
      AvatarShape: {
        id: 'npc-1',                                                       // unique (required)
        name: 'Guard',                                                     // shown above head
        bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
        wearables: [
          'urn:decentraland:off-chain:base-avatars:eyebrows_00',
          'urn:decentraland:off-chain:base-avatars:mouth_00',
          'urn:decentraland:off-chain:base-avatars:eyes_00',
          'urn:decentraland:off-chain:base-avatars:blue_tshirt',
          'urn:decentraland:off-chain:base-avatars:brown_pants',
          'urn:decentraland:off-chain:base-avatars:classic_shoes',
          'urn:decentraland:off-chain:base-avatars:short_hair'
        ],
        emotes: [],
        hairColor: { r: 0.92, g: 0.76, b: 0.62 },
        skinColor: { r: 0.94, g: 0.85, b: 0.6 }
      }
    }
  }
} satisfies Scene
```

**Notes:**
- Always include eyebrows, mouth, and eyes wearables — the avatar won't render face features without them.
- Moving the `Transform` position causes the NPC to walk/run to the destination (it does **not** teleport).
- Use `expressionTriggerTimestamp` as a Lamport timestamp to replay the same emote: first play = 0, second play = 1, etc.

### Playing expressions on an AvatarShape NPC

```typescript
// src/index.ts
const npc = engine.getEntityOrNullByName('guard')
if (npc) {
  AvatarShape.getMutable(npc).expressionTriggerId = 'wave'
  AvatarShape.getMutable(npc).expressionTriggerTimestamp = 1
}
```

### Mannequin mode (show wearables without a body)

Useful for storefronts and wearable displays:

```typescript
// main-entities.ts
mannequin: {
  components: {
    Transform: { position: { x: 4, y: 0, z: 4 } },
    AvatarShape: {
      id: 'mannequin-1',
      name: 'Display',
      bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
      wearables: ['urn:decentraland:matic:collections-v2:0x...:0'],
      emotes: [],
      show_only_wearables: true
    }
  }
}
```

For the full `AvatarShape` field reference and common base wearable URNs, see the `player-avatar` skill's references.

---

## Adding interactivity to AvatarShape NPCs

AvatarShape entities are **not clickable by default** — they have no collider, so pointer events won't register on them directly. Use one of:

### Option A — Add a MeshCollider for click interaction

Declare the collider in `main-entities.ts` alongside the AvatarShape:

```typescript
// main-entities.ts (added to the guard entry above)
MeshCollider: { mesh: { $case: 'cylinder', cylinder: {} } }
```

```typescript
// src/index.ts
import { engine, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'

export function main() {
  const npc = engine.getEntityOrNullByName('guard')
  if (npc) pointerEventsSystem.onPointerDown(
    { entity: npc, opts: { button: InputAction.IA_POINTER, hoverText: 'Talk' } },
    () => { console.log('Player clicked NPC') }
  )
}
```

### Option B — Proximity-based interaction

Trigger the interaction when the player walks near the NPC (no collider required):

```typescript
import { engine, pointerEventsSystem } from '@dcl/sdk/ecs'

export function main() {
  const npc = engine.getEntityOrNullByName('guard')
  if (npc) pointerEventsSystem.onProximityEnter(
    { entity: npc, opts: { maxPlayerDistance: 4 } },
    () => { /* start dialogue or other interaction */ }
  )
}
```

See the `add-interactivity` skill for the full Proximity Events API.
