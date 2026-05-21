---
name: editor-gizmo
description: Enable the visual editor in a Decentraland scene with translate/rotate gizmos. Adds click-to-select, drag-to-move arrows, drag-to-rotate rings, plane handles, wireframe selection box, and UI overlay. Auto-discovers all entities declared in main-entities.ts. Use when user wants to enable the editor, add gizmos, edit the scene interactively, or tweak object positions and rotations in preview.
---

# Visual Editor Gizmo

Add an in-scene visual editor that lets users click objects to select them, then drag arrow/disc handles to move or rotate them. The editor only edits entities declared in `main-entities.ts` — runtime-spawned entities are hidden from the hierarchy.

## How It Works

- **Preview only**: the editor only activates in `/preview`. Deployed scenes never show editor UI.
- **Editor toggle**: a pencil button in the bottom-right corner toggles the editor on/off (starts OFF).
- **Auto-discovery**: finds all entities with `Transform` + `MeshRenderer` or `GltfContainer`. Hierarchy filters to entities whose `Name` is declared in `main-entities.ts`.
- **Click to select**: shows a wireframe bounding box and spawns the gizmo.
- **Translate mode**: 3 colored arrows (R/G/B = X/Y/Z) — drag to move along a world axis. 3 plane handles (XZ/XY/YZ) for 2-axis constrained movement.
- **Rotate mode**: 3 colored ring outlines — drag to rotate around a world axis.
- **World-aligned gizmos**: arrows and rings always point along world X/Y/Z, regardless of entity or parent rotation. Drag deltas are converted to local space for child entities.
- **E key**: toggle between Move and Rotate.
- **F key** or **click ground**: deselect.
- **Undo/redo**: key 4 = undo, Shift+4 = redo.
- **Auto-save**: changes POST to `${realm.baseUrl}/editor/changes` on every drag end. The preview server merges them into `main-entities.ts` and synchronously regenerates `main.crdt`.

## Setup Steps

### Step 0: Check if editor is already installed (and up-to-date)

If `src/__editor/state.ts` exists, read the first line and look for `EDITOR_VERSION`. Compare it with the version in `{baseDir}/src/__editor/state.ts`. If the versions match, skip Step 1 — the files are current. If they differ (or `src/__editor/` doesn't exist), proceed with Step 1 to install or update.

### Step 1: Copy editor files into the scene

```bash
mkdir -p src/__editor && cp -rf {baseDir}/src/__editor/* src/__editor/
```

This creates a self-contained editor directory:
```
src/__editor/
├── index.ts       — Entry point + enableEditor() export
├── state.ts       — Shared state and types
├── persistence.ts — HTTP POST/GET to {baseUrl}/editor/changes
├── selection.ts   — Select/deselect + highlight
├── discovery.ts   — Auto-discover scene entities
├── gizmo.ts       — Translate/rotate gizmo handles
├── drag.ts        — Drag system (ray-plane intersection)
├── camera.ts      — Editor camera (orbit, WASD pan)
├── input.ts       — Key bindings (E, F, 1-4)
├── history.ts     — Undo/redo stack
├── math-utils.ts  — Vector/quaternion helpers
└── ui.tsx         — Toolbar + hierarchy + properties panel
```

### Step 2: Add `enableEditor()` to the scene's main function

In `src/index.ts`:

```typescript
import { enableEditor } from './__editor'

export function main() {
  // ... your scene code ...
  enableEditor()
}
```

`enableEditor()` is a no-op outside preview mode, so it's safe to leave in deployed scenes.

### Step 3: Make sure the scene has a `main-entities.ts`

If the scene doesn't have one yet, create `main-entities.ts` at the scene root with at least one entity (see "Authoring Model" below). Without it, the editor's hierarchy panel falls back to permissive mode and shows every named entity, including runtime ones.

### Step 4: Update tsconfig.json to include `main-entities.ts`

The default scene `tsconfig.json` only checks `src/**/*`. Widen the include so the typed `Scene` shape is validated:

```json
{
  "extends": "@dcl/sdk/types/tsconfig.ecs7.json",
  "include": ["src/**/*.ts", "src/**/*.tsx", "main-entities.ts"]
}
```

### Step 5: Verify

Run `/preview`. You should see a pencil button bottom-right. Click it to toggle the editor. Click any entity declared in `main-entities.ts` to select it; drag arrows or rings to move or rotate.

## Scene Authoring Model

The editor only edits **declared** entities — those that exist in `main-entities.ts`. Dynamic entities created at runtime via `engine.addEntity()` are hidden from the hierarchy and not draggable.

### `main-entities.ts` (canonical entity declarations)

`main-entities.ts` lives at the scene root, exports a typed `scene` constant, and is bundled into `main.crdt` at build time. The `satisfies Scene` clause keeps the literal keys typed (so code can reference entity names safely) while still validating the shape against the schema.

```typescript
import type { Scene } from '@dcl/sdk/scene-types'

export const scene = {
  "barrel_1": {
    "components": {
      "Transform": {
        "position": { "x": 5, "y": 0, "z": 8 },
        "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
        "scale": { "x": 1, "y": 1, "z": 1 }
      },
      "GltfContainer": { "src": "models/Barrel.glb" }
    }
  },
  "lamp_1": {
    "components": {
      "Transform": {
        "position": { "x": 0, "y": 1.5, "z": 0 },
        "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
        "scale": { "x": 1, "y": 1, "z": 1 },
        "parent": "barrel_1"
      },
      "GltfContainer": { "src": "models/Lamp.glb" }
    }
  }
} satisfies Scene
```

**Rules:**
- **Names are unique** within `scene` — they're the stable ID the editor and code use to reference an entity.
- **Parents are referenced by Name**, not entity ID (e.g. `"parent": "barrel_1"`). The build resolves names to IDs.
- **`Transform.position` is required.** `rotation` defaults to identity, `scale` defaults to `(1,1,1)`, but you must provide all three keys when authoring.
- **Literal-only constraint:** values inside `scene` must be plain JSON-compatible literals — no function calls (`Vector3.create(...)`), no spread, no computed expressions, no comments inside the literal. The build parses the AST and the editor save handler rewrites the whole literal as JSON, so anything outside this discipline gets stripped or breaks.

### Behavior in `src/index.ts`

Code references entities by Name and attaches behavior. Use a type-only import of `scene` so the bundle stays small, and derive `EntityName` for typo-safe lookups:

```typescript
import { engine, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
import { enableEditor } from './__editor'
import type { scene } from '../main-entities'

type EntityName = keyof typeof scene

export function main() {
  const barrel = engine.getEntityOrNullByName<EntityName>('barrel_1')
  if (barrel === null) return

  pointerEventsSystem.onPointerDown(
    { entity: barrel, opts: { button: InputAction.IA_POINTER, hoverText: 'Open' } },
    () => console.log('clicked barrel')
  )

  enableEditor()
}
```

- `engine.getEntityOrNullByName<EntityName>(name)` looks up an entity by its `Name` component, populated by the `main.crdt` preload (built from `main-entities.ts` at bundle time).
- The `<EntityName>` type parameter makes typos a compile error: passing `'barrl_1'` (typo) fails type-checking.
- Renaming an entity in `main-entities.ts` immediately surfaces every stale reference in code as a compile error.
- Use `getEntityOrNullByName` rather than `getEntityByName` — the SDK's typed `getEntityByName` requires awkward generics and silently returns `undefined` cast as `Entity`, so null-handling is cleaner.

### Dynamic entities

Anything that needs to spawn at runtime (effects, projectiles, dynamic UI markers) still uses `engine.addEntity()` directly:

```typescript
const explosion = engine.addEntity()
Transform.create(explosion, { position: Vector3.create(8, 1, 8) })
GltfContainer.create(explosion, { src: 'models/Explosion.glb' })
// Don't give dynamic entities a Name — they don't go in main-entities.ts.
```

**Rule**: only declarative, editable entities go in `main-entities.ts`. Dynamic runtime entities use `engine.addEntity` and don't get `Name` components.

## Persistence

When the user drags an entity in preview:

1. The scene applies the new Transform client-side (instant).
2. The editor POSTs `${realm.baseUrl}/editor/changes` with the entity's new Transform, keyed by Name.
3. The preview server merges the change into `main-entities.ts` on disk by parsing the AST, mutating the scene object, and splicing the new JSON back into the source — preserving everything outside the `scene` literal (imports, `satisfies` clause, comments above the export).
4. The same handler synchronously regenerates `main.crdt` so the next reload preloads the updated state.
5. Both `main-entities.ts` and `main.crdt` are excluded from the file watcher, so editor saves do not trigger a scene reload.

There is no manual "save" step — every drag persists.

If the AI / a human edits `main-entities.ts` directly (without going through the editor), a dedicated watcher on `main-entities.ts` regenerates `main.crdt` out-of-band as well, with an mtime check that skips redundant work when the editor's POST handler already produced a fresh CRDT.

## Removing the Editor

To remove:
1. Delete `src/__editor/`
2. Remove the `import { enableEditor } from './__editor'` line and the `enableEditor()` call

`main-entities.ts` is unaffected — it remains the source of truth for declared entities, regardless of whether the editor is installed.

## Adding New Entities

When the user asks to add a new entity (e.g., "add a barrel"):

1. **Add the entry to `main-entities.ts`** with a unique Name and the components needed to render it (`Transform`, `GltfContainer` or `MeshRenderer` + `Material`, etc.). The TS compiler will validate the shape against `Scene`.
2. **Reference it in code** if you need to attach behavior:
   ```typescript
   const barrel = engine.getEntityOrNullByName<EntityName>('barrel_1')
   ```
3. Run `/preview` — the entity will appear in the scene at the position declared in `main-entities.ts`, and will be draggable in the editor.

## Components supported in `main-entities.ts`

All ECS data components that the client renders/uses:

- `Transform` (required for every entity)
- `GltfContainer`, `MeshRenderer`, `MeshCollider`, `Material`
- `VisibilityComponent`, `Billboard`
- `AudioSource`, `VideoPlayer`, `TextShape`, `NftShape`
- `Animator` (state-machine config; runtime control via code)

Behavior — pointer event callbacks, systems, tweens, conditional logic — stays in `src/`.

## Common Pitfalls

- **Component shapes mirror the SDK protobuf.** `MeshRenderer` is `{ mesh: { $case: 'box', box: { uvs: [] } } }`, not `MeshRenderer.setBox()`. The TS compiler validates against the protobuf-derived types and will flag mismatches.
- **Don't use `Vector3.create(...)` inside `main-entities.ts`.** Use plain `{ x, y, z }` objects. The literal-only constraint means function calls and identifier references will break the build/save pipeline.
- **`box` mesh requires `uvs: []`.** Same for `plane`. Sphere and cylinder default to `{}`. The TS type forces this — pay attention to red squiggles.
- **Renaming an entity** breaks every code reference until you update them. That's the type system working as intended; let TS guide you to the broken references.
- **Comments inside the `scene` literal get wiped on the first editor save.** Keep comments outside the literal (above the import, before the `export const scene =` line).
