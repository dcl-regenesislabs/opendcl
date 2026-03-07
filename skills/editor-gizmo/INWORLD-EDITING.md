# In-World Editing — Design Document

## Overview

Enable admins to edit entity transforms in **deployed scenes** without redeploying. Uses the auth-server for persistence, authorization, and multiplayer sync. The same editor UI (gizmo, hierarchy, properties panel) works in both local dev and deployed mode.

## Architecture

```
┌─────────────────┐     lock/commit      ┌──────────────────────┐
│  Admin Client    │ ──── messages ────▶  │    Auth Server        │
│  (editor UI +   │                       │                       │
│   gizmo drag)   │ ◀── CRDT sync ─────  │  validate + persist   │
│                  │                       │  Storage("overrides") │
└─────────────────┘                       └──────────┬────────────┘
                                                     │ CRDT sync
                                          ┌──────────▼────────────┐
                                          │   All Other Clients    │
                                          │   (see final result)   │
                                          └────────────────────────┘
```

## Entity Lifecycle

```
Scene boots (server + all clients):
  1. Scene code creates entities normally (Transform, GltfContainer, Name)
  2. Server syncs all named entities: syncEntity(e, [Transform.componentId], enumId)
  3. Server applies saved overrides from Storage to matching Name entities
  4. Server protects Transforms via validateBeforeChange (dynamic lock check)

Player joins:
  5. Server reads PlayerIdentityData.address
  6. Checks against admin list (EnvVar ADMIN_WALLETS)
  7. Sends editorEnable message → client enables editor UI
  8. Sends current lock state for any locked entities

Admin edits:
  9.  Admin clicks entity → client sends editorLock(entityName)
  10. Server validates: is admin? is entity unlocked? → locks, broadcasts editorLocked
  11. validateBeforeChange now accepts this admin's Transform writes
  12. Admin drags → local Transform changes propagate via CRDT to everyone
  13. Admin drops → client sends editorCommit(entityName, transform)
  14. Server persists to Storage, broadcasts editorUnlocked
  15. Lock released, validateBeforeChange reverts to server-only

Admin resets:
  16. Admin clicks "Reset" → client sends editorReset(entityName)
  17. Server deletes override from Storage
  18. Server re-applies original code-defined transform
  19. CRDT syncs reset position to all clients
```

## Lock Mechanism

The lock serves two purposes:
- **Authorization**: only the locking admin's Transform writes pass validation
- **Conflict prevention**: only one admin can edit an entity at a time

```typescript
// Server-side validation callback (set once per entity, reads lock state dynamically)
Transform.validateBeforeChange(entity, (value) => {
  if (value.senderAddress === AUTH_SERVER_PEER_ID) return true
  const lockHolder = lockMap.get(entityName)
  return lockHolder === value.senderAddress
})
```

During drag, the admin writes Transform locally → CRDT propagates → all clients (including server) accept because `lockHolder === admin`. Other players see the entity move in real-time. On drop, server persists the final position.

If admin disconnects while holding a lock, server auto-releases it.

## Message Protocol

```typescript
import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const EditorMessages = {
  // Client → Server
  editorLock:    Schemas.Map({ entityName: Schemas.String }),
  editorCommit:  Schemas.Map({
    entityName: Schemas.String,
    px: Schemas.Float, py: Schemas.Float, pz: Schemas.Float,
    rx: Schemas.Float, ry: Schemas.Float, rz: Schemas.Float, rw: Schemas.Float,
    sx: Schemas.Float, sy: Schemas.Float, sz: Schemas.Float,
  }),
  editorUnlock:  Schemas.Map({ entityName: Schemas.String }),
  editorReset:   Schemas.Map({ entityName: Schemas.String }),

  // Server → Client
  editorEnable:  Schemas.Map({ admin: Schemas.Boolean }),
  editorLocked:  Schemas.Map({ entityName: Schemas.String, lockedBy: Schemas.String }),
  editorUnlocked:Schemas.Map({ entityName: Schemas.String }),
  editorState:   Schemas.Map({ overrides: Schemas.String }), // JSON blob, sent on join
}

export const editorRoom = registerMessages(EditorMessages)
```

## Storage Format

```typescript
// Key: "editor-overrides"
// Value: JSON string
{
  "bonfire": {
    "position": { "x": 8.5, "y": 0, "z": 10.2 },
    "rotation": { "x": 0, "y": 0.38, "z": 0, "w": 0.92 },
    "scale": { "x": 1, "y": 1, "z": 1 }
  },
  "camp_barrel": {
    "position": { "x": 3.0, "y": 0, "z": 0.5 }
    // rotation/scale omitted = use code defaults
  }
}
```

Only stores fields that differ from code-defined values. Per-entity keyed by `Name` component value.

## Project Structure

```
src/
├── index.ts                    # isServer() branch
├── scene-objects.ts            # Extracted: createSceneObjects() (shared, both sides run it)
├── shared/
│   ├── messages.ts             # EditorMessages + editorRoom
│   └── entity-map.ts           # Name → Entity lookup (populated after scene creation)
├── server/
│   ├── server.ts               # Server init: sync entities, load overrides, register handlers
│   ├── admin.ts                # Admin wallet check, lock management
│   └── overrides.ts            # Storage read/write, apply/reset overrides
├── client/
│   └── setup.ts                # Wait for editorEnable, conditionally call enableEditor()
└── __editor/
    ├── index.ts                # enableEditor() — existing, minimal changes
    ├── state.ts                # + isDeployed, lockMap
    ├── persistence.ts          # Reworked: editorRoom.send() instead of WebSocket
    ├── selection.ts            # + lock request on select, check lock state
    ├── ui.tsx                  # + lock icons, reset button, "Locked by..." label
    ├── gizmo.ts                # unchanged
    ├── drag.ts                 # endDrag calls persistence (already does)
    ├── camera.ts               # unchanged
    ├── discovery.ts            # unchanged
    ├── input.ts                # unchanged
    ├── math-utils.ts           # unchanged
    └── history.ts              # unchanged
```

## What Changes in Existing Code

### state.ts
```typescript
// New fields
isDeployed: boolean           // true when running with auth-server
lockMap: Map<string, string>  // entityName → wallet address of lock holder
```

### persistence.ts — full rework
- **Local mode** (current): WebSocket to preview server (unchanged behavior)
- **Deployed mode**: `editorRoom.send('editorCommit', ...)` on drop
- `sendEntityUpdate()` checks `state.isDeployed` and routes accordingly
- Lock/unlock: `editorRoom.send('editorLock', ...)` / `editorRoom.send('editorUnlock', ...)`
- Listen for `editorLocked` / `editorUnlocked` broadcasts → update `state.lockMap`

### selection.ts
- On `selectEntity()`: if deployed, send lock request and wait for confirmation
- If entity is locked by someone else, show message but don't select
- On `deselectEntity()`: if deployed, send unlock

### ui.tsx
- Hierarchy rows: show lock icon + dimmed style for entities locked by other admins
- Properties panel: "Reset" button that sends `editorReset`
- Status indicator: show connected/admin state

### index.ts (editor entry)
- `enableEditor()` receives a config: `{ deployed: boolean }`
- If deployed, skip WebSocket connection, set `state.isDeployed = true`
- Everything else identical

## Server Implementation

### server.ts
```
1. Build Name → Entity map from all scene entities
2. syncEntity() each named entity with Transform
3. Set validateBeforeChange per entity (dynamic lock check)
4. Load overrides from Storage, apply to entities
5. Register message handlers (lock, commit, unlock, reset)
6. Track player connections for admin detection + lock cleanup
```

### admin.ts
```
- Read ADMIN_WALLETS from EnvVar (comma-separated addresses)
- lockMap: Map<string, string> (entityName → adminAddress)
- isAdmin(address): check against list
- acquireLock(entityName, address): check availability, add to map
- releaseLock(entityName, address): remove from map
- releaseAllLocks(address): cleanup on disconnect
```

### overrides.ts
```
- loadOverrides(): Storage.world.get("editor-overrides") → parse → apply to entities
- saveOverride(name, transform): merge into stored JSON → Storage.world.set()
- deleteOverride(name): remove from stored JSON → Storage.world.set()
- getOriginalTransform(name): stored at boot before overrides applied
```

## Implementation Order

1. **Extract scene objects** — move `createSceneObjects()` to `scene-objects.ts` (shared)
2. **Shared messages** — `shared/messages.ts` with EditorMessages schema
3. **Server scaffold** — `server/server.ts` with entity sync + validateBeforeChange
4. **Server overrides** — `server/overrides.ts` with Storage read/write
5. **Server admin + locks** — `server/admin.ts` with lock management
6. **Server message handlers** — wire lock/commit/unlock/reset
7. **Client setup** — `client/setup.ts` listens for editorEnable
8. **Rework persistence.ts** — dual mode (local WebSocket vs deployed messages)
9. **Selection lock flow** — lock on select, unlock on deselect
10. **UI lock indicators** — lock icons, reset button
11. **Test locally with hammurabi-server**

## Open Items (Post-v1)

- **Undo/redo in deployed mode**: currently local-only history. Could send undo as a commit of the previous transform.
- **Scale editing**: currently only position + rotation. Scale gizmo is a future feature anyway.
- **Multi-admin visibility**: show which admin is editing what (name labels on locked entities).
- **Smooth transitions for other players**: optional Tween on entity when override applied, instead of instant teleport.
- **Access control UI**: admin panel to manage wallet list without redeploying.
