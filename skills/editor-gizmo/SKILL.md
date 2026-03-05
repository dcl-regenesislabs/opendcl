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

If `src/__editor/state.ts` exists, read the first line and look for `EDITOR_VERSION`. Compare it with the version in `{baseDir}/src/__editor/state.ts`. If the versions match, skip Step 1 — the files are current. If they differ (or `src/__editor/` doesn't exist), proceed with Step 1 to install or update.

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

### Data format (`editor-scene.json`)

The file contains raw quaternion rotations for lossless restore:

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

## Applying Editor Changes to Source Code

When the user asks to apply editor changes (or says "save editor", "apply editor changes", etc.), follow this process:

### Step 1: Create a backup

Move the changes file to a backup before modifying any source code:

```bash
mv src/__editor/editor-scene.json src/__editor/editor-scene.json.bkp
```

This is atomic — if anything goes wrong, the `.bkp` file still has the data.

If `editor-scene.json.bkp` already exists (interrupted previous apply), skip this step and work from the existing `.bkp`.

### Step 2: Read the changes

Read `src/__editor/editor-scene.json.bkp`. Each key is an entity name (matching the `Name` component), and the value contains the new `Transform` data with position, rotation (raw quaternion), and scale.

### Step 3: Convert quaternions to euler angles

The JSON stores rotations as raw quaternions `{ x, y, z, w }`. Convert to euler degrees for human-readable code using this formula:

```
sinRoll  = 2 * (w*x + y*z)
cosRoll  = 1 - 2 * (x*x + y*y)
euler.x  = atan2(sinRoll, cosRoll) * 180/π

sinPitch = 2 * (w*y - z*x)
euler.y  = |sinPitch| >= 1 ? sign(sinPitch) * 90 : asin(sinPitch) * 180/π

sinYaw   = 2 * (w*z + x*y)
cosYaw   = 1 - 2 * (y*y + z*z)
euler.z  = atan2(sinYaw, cosYaw) * 180/π
```

Round all values to 2 decimal places.

### Step 4: Patch Transform.create() calls in source code

For each entity in the changes file:

1. **Find the entity** in the source code by its `Name` component value (e.g., `Name.create(entity, { value: 'barrel_1' })`)
2. **Update the `Transform.create()` call** for that entity with the new position and rotation

**Position format:**
```typescript
position: Vector3.create(5.2, 0, 15)
```

**Rotation format** (converted from quaternion to euler):
```typescript
rotation: Quaternion.fromEulerDegrees(0, 90, 0)
```

### Critical rules

- ⚠️ **Never pass `undefined` to any Transform field** — the SDK serializer crashes reading `.x` on `undefined`
- **If rotation is identity** (euler 0, 0, 0): **omit the rotation key entirely** from the `Transform.create()` call, don't set it to `undefined`
- **If scale is unchanged** (1, 1, 1): you can omit it, but if it was already in the code, keep it
- **Preserve existing code structure** — only change the position/rotation values, don't reformat or restructure

### Step 5: Clean up

After **all** changes are successfully applied to the source code:

```bash
rm src/__editor/editor-scene.json.bkp
```

### If something goes wrong

If the apply fails partway through, restore the backup:

```bash
mv src/__editor/editor-scene.json.bkp src/__editor/editor-scene.json
```

### Full example

Given this in `editor-scene.json.bkp`:
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
  },
  "red_box": {
    "components": {
      "Transform": {
        "position": { "x": 8, "y": 2.5, "z": 10 },
        "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
        "scale": { "x": 1, "y": 1, "z": 1 }
      }
    }
  }
}
```

The source code changes would be:

```typescript
// barrel_1: position changed, rotation = 90° around Y
Transform.create(barrel, { position: Vector3.create(5.2, 0, 15), rotation: Quaternion.fromEulerDegrees(0, 90, 0) })

// red_box: position changed, rotation is identity → omit rotation key
Transform.create(redBox, { position: Vector3.create(8, 2.5, 10) })
```

Then delete `src/__editor/editor-scene.json.bkp`.

### Safety checks
- **Before deploy**: Check if `src/__editor/editor-scene.json` or `src/__editor/editor-scene.json.bkp` exists with content. If so, warn the user that there are unapplied editor changes and suggest applying them first.
- **On session start**: If either file exists, ask the user if they want to apply changes.

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
