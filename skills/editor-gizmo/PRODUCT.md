# Editor Product Guide

## What This Is

An in-scene visual editor for Decentraland SDK7. Users add `enableEditor()` to their scene, and they get gizmo-based manipulation of entities directly inside the preview — no external tools needed.

## Design Principles

### 1. Zero Configuration
The editor auto-discovers every entity in the scene. No manual registration, no component tagging, no config files. Drop `enableEditor()` at the end of `main()` and it works.

### 2. Non-Destructive
The editor never modifies the user's scene code at runtime. It only:
- Adds its own entities (gizmos, indicators, ground plane, cameras)
- Temporarily modifies colliders on the selected entity (restored on deselect)
- Sends changes to the preview server (external persistence)

Removing the editor = delete `src/__editor/` + remove two lines of code. Scene returns to exactly its original state.

### 3. Works Everywhere
The editor must function in both the Bevy and Unity Decentraland renderers. Features that only work in one renderer (like `InputModifier`) are used as progressive enhancements, not hard requirements. The core editing experience (select, translate, rotate) must work in both.

### 4. Predictable Controls
Follow established 3D editor conventions:
- **Left-click** = select / interact
- **E** = toggle transform mode
- **F** = focus selected / deselect
- **WASD** = camera movement (when in editor camera)
- Colored axes: **Red = X, Green = Y, Blue = Z**
- Gizmo handles highlight on hover

### 5. Scene Sandbox Constraints
Everything runs inside Decentraland's QuickJS sandbox:
- No filesystem access — persistence goes through the preview server
- No Node.js APIs — only `fetch`, `WebSocket`, and SDK imports
- Entity limits — editor entities count toward the scene budget
- All math must be synchronous (no async in systems)

## Current Features

### Selection System
- Click any entity with `MeshRenderer` or `GltfContainer` to select
- Yellow wireframe bounding box shows selection
- Colliders temporarily disabled on selected entity so clicks pass through to gizmo
- Click ground or press F to deselect
- Re-click selected entity to deselect (toggle)

### Translate Gizmo
- Three arrow handles (X=red, Y=green, Z=blue)
- Drag to move entity along a single axis
- Ray-plane intersection for accurate dragging at any camera angle
- Hover feedback: arrow brightens on mouseover

### Rotate Gizmo
- Three disc handles (X=red, Y=green, Z=blue)
- Drag to rotate entity around a single axis
- Angle computed via atan2 on the rotation plane
- Hover feedback: disc becomes more opaque on mouseover

### Editor Camera
- Toggle with 1 key
- Orbit camera: WASD pan, Space/Shift up/down, 2/3 zoom, left-click drag orbit
- F key focuses on selected entity
- Player movement frozen via `InputModifier.disableAll`

### Camera Lock (Unity Fix)
- Gizmo handle hover activates a VirtualCamera that mirrors the real camera
- On drag start, mirroring stops → camera freezes
- Prevents Unity renderer from rotating camera during gizmo drag

### Undo/Redo
- Press 4 to undo, Shift+4 to redo
- Tracks before/after transform snapshots for each drag operation
- Up to 50 entries in history stack
- Redo entries are discarded when a new drag is performed
- Sends persistence update on undo/redo (keeps server in sync)

### Persistence
- Changes sent via WebSocket on every drag end
- Preview server writes to `src/__editor/editor-scene.json`
- On reload, changes are fetched and re-applied
- AI assistant can apply changes to source code on request

### UI Overlay
- Bottom-left panel shows: mode, entity count, connection status
- When entity selected: name, position (X/Y/Z), rotation (X/Y/Z)
- Context-sensitive control hints

## Planned Features

_Add new features here with a brief description before implementing._

### Scale Gizmo
- Add uniform and per-axis scale handles
- Visual: small cubes at the end of each axis line

### ~~Undo/Redo~~ ✅ Shipped

### Multi-Select
- Shift+click to add to selection
- Move/rotate multiple entities as a group
- Wireframe box encompasses all selected entities

### Snap to Grid
- Optional grid snapping for translate (e.g., 0.25m, 0.5m, 1m increments)
- Optional angle snapping for rotate (e.g., 15°, 45°, 90°)
- Toggle with a key, configurable step size

### Entity List UI
- Scrollable list of all discovered entities
- Click to select from list
- Search/filter by name
- Show/hide toggle per entity

### Duplicate Entity
- Select + key shortcut to clone an entity
- Places copy offset from original
- Auto-generates unique name (`barrel_1` → `barrel_2`)

### Delete Entity
- Select + key shortcut to remove (with confirmation)
- Sends delete event to persistence

### Transform Input Fields
- Editable position/rotation/scale values in the UI
- Click a number to type an exact value
- Tab between fields

### Parcel Boundary Visualization
- Show parcel grid lines on the ground
- Warn when entity is placed outside boundaries
- Show height limit

### Camera Bookmarks
- Save/restore camera positions (like browser bookmarks)
- Quick keys to jump between viewpoints

## Feature Development Checklist

When adding a new feature:

1. **Add it to this file first** — describe what it does in the Planned Features section above
2. **Update ARCHITECTURE.md** — add modules, state, systems as needed
3. **Create the module file(s)** — follow the module map in ARCHITECTURE.md
4. **State goes in state.ts** — new state fields, types, collections
5. **Pure logic in math-utils.ts** — any new math that doesn't need ECS
6. **Wire in index.ts** — import, create, register systems
7. **Update UI** — add relevant status/controls to ui.tsx
8. **Update SKILL.md** — if the feature changes setup steps or user-facing behavior
9. **Test** — unit tests for pure logic, manual test against the checklist
10. **Bump EDITOR_VERSION** in state.ts

## User Experience Guidelines

### Visual Feedback
- Every interactive element must have hover feedback (color change, opacity, glow)
- Active/dragging state must be visually distinct from hover
- Selection must be immediately obvious (wireframe box)

### Error Prevention
- Don't allow dragging when no entity is selected
- Don't allow mode changes during a drag
- Don't allow editor camera toggle during a drag
- Guard against missing transforms (entities can be removed)

### Performance
- Editor entities count toward scene limits — minimize entity count
- Discovery system runs every frame — keep it fast (simple has/get checks)
- Avoid creating/destroying entities during drag (only on select/deselect)
- Reuse gizmo entities when possible (recreate only on mode change)

### Console Logging
- Prefix all logs with `[editor]`
- Log meaningful state changes: selection, mode toggle, camera toggle, drag results
- Don't log per-frame (no spam in systems)
- Log WebSocket connection state changes
