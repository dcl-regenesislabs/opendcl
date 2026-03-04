---
name: editor-gizmo
description: Enable editor mode in a Decentraland scene with translate/rotate gizmos. Adds click-to-select, drag-to-move arrows, drag-to-rotate discs, wireframe selection box, and UI overlay. Auto-discovers all scene entities. Use when user wants to enable editor mode, add gizmos, edit the scene interactively, or tweak object positions and rotations in preview.
---

# Visual Editor Gizmo

Add an in-scene visual editor that lets users click objects to select them, then drag arrow/disc handles to move or rotate them. The editor auto-discovers all entities in the scene — no manual registration needed.

## How It Works

- **Auto-discovery**: Finds all entities with `Transform` + `MeshRenderer` or `GltfContainer`
- **Click to select**: Shows a wireframe bounding box and spawns the gizmo
- **Translate mode**: 3 colored arrows (R/G/B = X/Y/Z) — drag to move along an axis
- **Rotate mode**: 3 colored discs — drag to rotate around an axis
- **E key**: Toggle between Move and Rotate
- **F key** or **click ground**: Deselect
- **Auto-save**: Changes are sent to the preview server via WebSocket on every drag end
- **Hover feedback**: Hovered arrow/disc highlights, stays highlighted during drag
- **Ray-plane intersection**: Accurate dragging regardless of camera angle

## Prerequisites

The editor currently only works with **auth-server scenes** (`"authoritativeMultiplayer": true` in `scene.json` and `@dcl/sdk@auth-server` installed). It uses `isServer()` internally to skip initialization on the server side.

## Setup Steps

### Step 0: Check if editor is already installed (and up-to-date)

If `src/__editor/state.ts` exists, read the first line and look for `EDITOR_VERSION`. Compare it with the version in `{baseDir}/editor-files/state.ts`. If the versions match, skip Step 1 — the files are current. If they differ (or `src/__editor/` doesn't exist), proceed with Step 1 to install or update.

### Step 1: Copy editor files into the scene

Copy the pre-built editor files into the scene's `src/__editor/` directory:

```bash
mkdir -p src/__editor && cp -rf {baseDir}/src/__editor/* src/__editor/
```

This creates:
```
src/__editor/
├── index.ts   — Main editor logic + enableEditor() export
├── state.ts   — Shared state and types
└── ui.tsx     — Editor UI overlay
```

### Step 2: Add Name components to all scene entities

**IMPORTANT**: Every entity that the user might want to move/rotate must have a `Name` component with a **unique** string value. The `Name` is the stable identifier used to match runtime entities back to source code when saving changes.

```typescript
import { Name } from '@dcl/sdk/ecs'

const barrel = engine.addEntity()
Name.create(barrel, { value: 'barrel_1' })
Transform.create(barrel, { position: Vector3.create(5, 0, 15) })
GltfContainer.create(barrel, { src: 'models/Barrel.glb' })
```

Naming convention: `{descriptive_name}_{number}` — e.g. `barrel_1`, `red_box`, `lamp_2`.

If an entity has no `Name` component, the editor still discovers and allows editing it, but the save system can't reliably match it back to the source code.

### Step 3: Add enableEditor() to the scene's main function

In the scene's `src/index.ts` (or wherever `export function main()` is defined):

1. Add this import at the top:
```typescript
import { enableEditor } from './__editor'
```

2. Add this call at the **end** of `main()`, after all entities are created:
```typescript
enableEditor()
```

The `enableEditor()` call must be **after** all entity creation so that the discovery system finds everything on its first frame. The editor automatically skips initialization on the server side.

**Full example:**
```typescript
import { engine, Transform, MeshRenderer, GltfContainer, Name } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { enableEditor } from './__editor'

export function main() {
  const cube = engine.addEntity()
  Name.create(cube, { value: 'red_cube' })
  Transform.create(cube, { position: Vector3.create(8, 1, 8) })
  MeshRenderer.setBox(cube)

  const table = engine.addEntity()
  Name.create(table, { value: 'table_1' })
  Transform.create(table, { position: Vector3.create(12, 0, 8) })
  GltfContainer.create(table, { src: 'models/table.glb' })

  enableEditor()
}
```

### Step 4: Verify

Run the preview. You should see:
- Bottom-left UI panel showing "EDITOR [Move] (N objects)" with WebSocket connection status
  - `● connected` (green) = auto-save active
  - `● N unsaved` (yellow) = changes pending write
  - `○ not connected` (red) = no persistence
- Click any object → wireframe box appears + gizmo arrows
- Selected entity shows position (X/Y/Z) and rotation (X/Y/Z) values in the panel
- Drag arrows to move, press E to switch to rotate mode
- Press F or click ground to deselect

## Persistence Pipeline

The editor auto-saves entity transforms to the preview server. The full pipeline:

### During editing (automatic)
1. User drags an object → `endDrag()` sends transform via **WebSocket** to the preview server
2. Server accumulates changes in memory (keyed by entity `Name`)
3. Server debounce-writes to `src/__editor/editor-scene.json` on disk (1s delay)
4. On scene reload, editor fetches `GET /editor/changes` from server memory to restore positions

### Applying to source code (user-initiated)
1. User runs **`/save-editor`** in the CLI
2. CLI moves `editor-scene.json` → `editor-scene.json.bkp` (atomic backup)
3. Agent reads the backup, patches `Transform.create()` calls in source code
   - ⚠️ **Never pass `undefined` Transform fields** — if a rotation is all zeros or identity, **omit the rotation key entirely** rather than passing `undefined`. The SDK serializer crashes reading `.x` on `undefined`.
4. On success, agent deletes the `.bkp` file
5. On failure, `.bkp` is restored to `editor-scene.json`

### Safety checks
- **On `/deploy`**: Warns if there are unapplied editor changes — prompts to run `/save-editor` first
- **On `/preview`**: Notifies if pending changes exist
- **On first user message**: If `editor-scene.json` (or `.bkp` from an interrupted apply) exists, prompts user to apply (uses `before_agent_start` event so the terminal prompt works correctly)

### Data format (`editor-scene.json`)
```json
{
  "barrel_1": {
    "components": {
      "Transform": {
        "position": { "x": 5.2, "y": 0, "z": 15 },
        "rotation": { "x": 0, "y": 0.707, "z": 0, "w": 0.707 },
        "scale": { "x": 1, "y": 1, "z": 1 }
      }
    }
  }
}
```

Raw quaternion is stored for lossless restore. The CLI agent converts to euler for human-readable code: `Quaternion.fromEulerDegrees(0, 90, 0)`.

## How the Editor Auto-Discovers Entities

The `discoverySystem` runs every frame and queries:
- `engine.getEntitiesWith(Transform, MeshRenderer)` — finds primitives (box, sphere, cylinder)
- `engine.getEntitiesWith(Transform, GltfContainer)` — finds GLB models

It automatically:
- Skips editor-owned entities (gizmo arrows, indicators, invisible ground)
- Skips engine built-in entities (RootEntity, CameraEntity, PlayerEntity)
- Adds a pointer collider if the entity doesn't have one
- Estimates bounding box from `Transform.scale`
- Reads entity name from `Name` component, falls back to GLB filename or mesh type

**Entities added dynamically** (after `main()` returns) are discovered on the next frame.

## Bounds Estimation

The auto-discovery estimates bounding boxes:
- **Primitives**: bounds = `Transform.scale` (unit-sized meshes scaled by transform)
- **GLB models**: defaults to `Transform.scale` with center offset at half height

These estimates are approximate. The wireframe box may not perfectly fit every model, but it's functional for selection feedback.

## Removing the Editor

To remove the editor from a scene:
1. Delete the `src/__editor/` directory
2. Remove the `import { enableEditor } from './__editor'` line
3. Remove the `enableEditor()` call
4. `Name` components can be kept or removed — they have no runtime cost

The editor doesn't modify any existing scene code or entities — it only adds its own systems and UI.

## Technical Details

### Collider Management
When an object is selected, the editor removes its `MeshCollider` and zeros out `GltfContainer` collision masks so that clicks pass through to the gizmo handles behind/inside the model. On deselect, colliders are fully restored.

### Drag Mechanism
Uses ray-plane intersection for both translate and rotate:
- **Translate**: Casts camera ray onto a plane containing the drag axis, projects hit delta onto the axis
- **Rotate**: Casts camera ray onto the plane perpendicular to the rotation axis, computes angle delta via `atan2`
- The drag plane normal is locked at drag start to prevent jumps if the camera rotates mid-drag

### Console Logging
Every move/rotate operation logs the final position/rotation to the console:
```
[editor] move x: pos=(5.20, 1.00, 8.00)
[editor] rotate y: rot=(0.0, 45.2, 0.0)
```
