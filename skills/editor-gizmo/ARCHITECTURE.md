# Editor Architecture

## Overview

The editor is an in-scene tool for Decentraland SDK7 that provides visual manipulation of entities (translate, rotate) via gizmo handles, an orbit camera, entity discovery, and persistence. It runs entirely inside the scene's QuickJS sandbox — no external processes.

## Module Map

```
src/__editor/
├── index.ts           Entry point — enableEditor(), wires all modules
├── state.ts           Shared state, types, entity tracking collections
├── ui.tsx             React-ECS UI overlay
├── camera.ts          Editor orbit camera (pan, zoom, orbit, focus)
├── camera-lock.ts     Gizmo hover camera lock (Unity renderer fix)
├── discovery.ts       Auto-discovery of scene entities
├── selection.ts       Select/deselect, highlight, collider management
├── indicator.ts       Wireframe bounding box around selected entity
├── gizmo.ts           Gizmo creation (translate arrows + rotate discs)
├── drag.ts            Ray-plane intersection drag (translate + rotate)
├── input.ts           Key bindings, mode toggle, gizmo click flag
├── persistence.ts     WebSocket connection, override loading, save
├── history.ts         Undo/redo stack with transform snapshots
└── math-utils.ts      Pure math: ray-plane, axis vectors, orbit math
```

## Data Flow

```
           ┌──────────────┐
           │   state.ts   │  ← single source of truth
           └──────┬───────┘
                  │ read/write
    ┌─────────────┼─────────────────┐
    │             │                 │
    ▼             ▼                 ▼
discovery.ts  selection.ts     camera.ts
    │             │                 │
    │ writes      │ writes          │ reads
    │ selectableInfoMap  selectedEntity   state.isDragging
    │             │                 │
    ▼             ▼                 ▼
 gizmo.ts     indicator.ts    camera-lock.ts
    │                               │
    │ spawns handles                │ reads
    ▼                               │ gizmo hover
 drag.ts ◄──────────────────────────┘
    │
    │ on drag end
    ▼
persistence.ts → WebSocket → preview server → editor-scene.json
```

### Key Rule: Modules Communicate Through State

Modules never import each other (except `state.ts` and `math-utils.ts`). They read/write shared state. `index.ts` is the only file that imports all modules and wires them together (registering systems, creating entities, connecting event handlers).

## State Ownership

| State | Owner | Readers |
|-------|-------|---------|
| `selectedEntity`, `selectedName` | selection.ts | gizmo, drag, indicator, camera, ui |
| `isDragging`, `dragAxis`, `dragStart*` | drag.ts | camera, camera-lock, input, gizmo |
| `gizmoMode` | input.ts | gizmo, drag, ui |
| `editorCamActive` | camera.ts | camera-lock, input, drag, ui |
| `selectableInfoMap` | discovery.ts | selection, gizmo, drag, camera, persistence |
| `editorEntities` | all creators | discovery (skip set) |
| `gizmoEntities`, `gizmoRoot` | gizmo.ts | drag (gizmo follow) |
| `wsConnected`, `pendingChanges` | persistence.ts | ui |
| `handleAxisMap`, `handleDiscMap`, `handleArrowMap` | gizmo.ts | gizmo (hover), drag |
| `gizmoClickConsumed` | input.ts | selection, camera |

## Systems & Execution Order

Systems are registered with priority (higher = runs first):

| Priority | System | Module | Purpose |
|----------|--------|--------|---------|
| 102 | `editorCameraSystem` | camera.ts | Editor cam pan/zoom/orbit input |
| 101 | `cameraTrackingSystem` | camera-lock.ts | Mirror real camera to lock VirtualCamera |
| 100 | `discoverySystem` | discovery.ts | Find new entities each frame |
| default | `dragSystem` | drag.ts | Process active gizmo drag |
| default | `gizmoFollowSystem` | gizmo.ts | Keep gizmo positioned on selected entity |
| default | `modeToggleSystem` | input.ts | E/F/1 key handling |
| MAX_INT | `resetGizmoClickFlag` | input.ts | Clear consumed flag (must run last) |

## Entity Ownership

The editor creates several internal entities. All are tracked in `editorEntities` so discovery skips them:

- **Deselect ground plane** — invisible 300×300m box at y=-0.05, catches clicks on empty space
- **Editor camera entity** — VirtualCamera for orbit mode
- **Lock camera entity** — VirtualCamera for hover-based camera freeze
- **Gizmo root** — parent of all gizmo handle entities (destroyed/recreated on selection change)
- **Gizmo handles** — arrow shafts, tips, collider cylinders (translate) or disc + collider (rotate)
- **Selection indicator** — 12 edge entities forming a wireframe box, parented to selected entity

## Camera Subsystem

Two VirtualCameras exist simultaneously, only one active at a time:

### Editor Camera (camera.ts)
- **Orbit model**: `target` (Vector3) + `yaw` (degrees) + `pitch` (degrees) + `distance` (meters)
- Activated/deactivated with 1 key
- When active: `InputModifier.disableAll` freezes player, WASD/Space/Shift control camera
- Focus (F key): moves target to selected entity center, resets distance

### Lock Camera (camera-lock.ts)
- Only active when editor camera is OFF
- Activated on gizmo handle hover, deactivated on hover leave
- Mirrors real camera transform every frame while active
- On drag start: stops mirroring (freezes view)
- On drag end: deactivates entirely
- Purpose: prevents Unity renderer from rotating camera during gizmo drag

### Priority Rules
1. Editor camera ON → lock camera disabled entirely
2. Editor camera OFF + hovering gizmo → lock camera active + mirroring
3. Editor camera OFF + dragging → lock camera active + frozen
4. Editor camera OFF + not hovering → lock camera inactive, normal player camera

## Drag Subsystem

### Translate Drag
1. On click: cast ray from camera through cursor onto a plane containing the entity
2. Plane normal chosen to be most perpendicular to camera forward (avoids grazing angles)
3. Each frame: recast ray, compute hit delta, project onto drag axis, apply displacement
4. Plane normal locked at drag start to prevent jumps

### Rotate Drag
1. On click: cast ray onto plane perpendicular to rotation axis, compute initial angle via atan2
2. Each frame: recast ray, compute current angle, apply delta as quaternion rotation
3. Rotation is incremental from drag start (not accumulated) to avoid drift

### Camera Source (BUG — to fix)
`startDrag` and `dragSystem` read `engine.CameraEntity` for ray origin. When editor camera is active, this should read from the editor camera entity's transform instead, since `engine.CameraEntity` still tracks the frozen player camera, not the virtual camera viewpoint.

## Persistence Pipeline

```
drag end → sendEntityUpdate(entity)
         → WebSocket message { type: "editor-update", name, components: { Transform } }
         → preview server accumulates in memory
         → debounce write to src/__editor/editor-scene.json (1s)
         → on reload: GET /editor/changes → applyOverrides()
```

## Conventions

### Naming
- **Systems**: `fooSystem` — registered with `engine.addSystem()`
- **Setup functions**: `createFoo()` — called once in `enableEditor()`
- **State mutators**: `setFoo()` — exported setters for `let` variables in state.ts
- **Entity names**: snake_case with numeric suffix (`barrel_1`, `red_box`)

### Constants
- All tuning constants at the top of their module (not scattered in functions)
- Named in UPPER_SNAKE_CASE
- Grouped by subsystem with comment headers

### Types
- All shared types in `state.ts`
- Module-internal types stay in their module file
- Prefer interfaces over type aliases for object shapes

### Error Handling
- ECS queries: always guard with `Component.has(entity)` before `.get()`
- Transform access: guard with `Transform.has()` — entities can be removed mid-frame
- WebSocket/fetch: catch and log, never crash the scene
- Ray-plane intersection: return `null` on degenerate cases (parallel ray)

## Testing Strategy

### Unit-Testable (no ECS)
- `math-utils.ts` — ray-plane intersection, axis vectors, angle calculations, orbit math
- Persistence message format construction
- Quaternion→euler conversion (for apply step)
- Orbit parameter → camera position calculation

### Integration-Testable (mock ECS)
- Discovery filters (skip editor entities, skip built-ins)
- Selection state transitions
- Drag state machine (start → drag → end)
- Camera mode transitions (off → editor → off, hover → lock → drag → unlock)

### Manual Testing Checklist
- [ ] Click primitive → wireframe + gizmo appears
- [ ] Click GLB model → same
- [ ] Drag translate arrow → entity moves on axis only
- [ ] Drag rotate disc → entity rotates on axis only
- [ ] E key → toggle Move/Rotate, gizmo updates
- [ ] F key → deselect (normal mode) / focus (editor cam)
- [ ] 1 key → toggle editor camera
- [ ] WASD → pan camera (correct directions)
- [ ] 2/3 → zoom in/out
- [ ] Left-click drag empty space → orbit
- [ ] Gizmo drag works in editor cam mode
- [ ] Camera stays frozen during gizmo drag (Unity renderer)
- [ ] WebSocket connects and changes persist across reload
- [ ] Deselect on ground click
- [ ] Editor ignores its own entities (no selecting gizmo parts)
