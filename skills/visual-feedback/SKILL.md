---
name: visual-feedback
description: Use the screenshot tool to see the running Decentraland preview, verify scene changes visually, explore from different angles, and iterate until the scene looks right. Use when the preview is running and you need to check what the scene looks like, debug visual issues, verify placement, or iterate on appearance.
---

# Visual Feedback — Seeing Your Scene

The `screenshot` tool lets you capture what the Decentraland preview looks like right now. The browser stays open between calls — only the first screenshot takes ~15s (launch + enter scene). After that, screenshots are instant.

**Prerequisites:** The preview server must be running (`/preview`). The tool auto-detects the preview URL.

## When to Use Screenshots

- **After placing objects** — verify they're positioned correctly, not floating or buried
- **After changing materials/colors** — confirm the visual result matches intent
- **After downloading 3D models** — check they loaded and look right
- **When the user asks "how does it look?"** — show them and describe what you see
- **When debugging** — "the tree is invisible" → screenshot to see what's actually rendering
- **When iterating** — code → screenshot → fix → screenshot until it's right

## Basic Usage

Take a screenshot of the current view:

```
Use the screenshot tool with no actions to capture the current scene view.
```

The tool returns the image directly — you'll see it and can describe what's visible.

## Movement & Exploration

The scene camera **always faces north** in headless mode. Movement is relative to compass direction, not camera:

| Action | Direction | Key |
|--------|-----------|-----|
| `moveForward` | North (toward top of screen) | W |
| `moveBack` | South (toward bottom) | S |
| `moveRight` | East (toward right) | D |
| `moveLeft` | West (toward left) | A |

Movement speed is ~6 meters/second. Default `holdMs` is 500ms (~3 meters).

### Exploring a scene

To see objects from different angles, chain movement actions before capturing:

```
screenshot with actions:
1. moveForward (holdMs: 1000) — walk 6m north
2. moveRight (holdMs: 500) — strafe 3m east
→ captures screenshot from the new position
```

### Camera rotation

Use look actions to rotate the camera view:

| Action | Effect |
|--------|--------|
| `lookLeft` | Rotate camera left |
| `lookRight` | Rotate camera right |
| `lookUp` | Tilt camera up |
| `lookDown` | Tilt camera down |

Default rotation is 200 pixels of mouse drag. Use `dx`/`dy` for more or less.

## Interacting Before Capture

### Click on objects

```
screenshot with actions:
1. click (x: 640, y: 400) — click center of viewport
→ captures the result (e.g., object selected, door opened)
```

Coordinates are in pixels (viewport is 1280×720).

### Press keys

```
screenshot with actions:
1. key (key: "1") — toggle editor camera
2. wait (ms: 500) — let camera settle
→ captures the overhead editor view
```

## Visual Iteration Pattern

When building or modifying a scene, use this loop:

1. **Make code changes** (write to `src/index.ts`)
2. **Wait for hot reload** — use `wait` action with ~2000ms
3. **Take screenshot** — see what changed
4. **Evaluate** — describe honestly: what works, what's wrong, what's missing
5. **Fix and repeat** — up to 5 iterations

Example flow:
```
1. Write code to add a red cube at (8, 1, 8)
2. screenshot with actions: [wait 2000ms]
   → "I can see a red cube floating 1m above the ground at the center. It looks correct."
3. Write code to add a blue sphere next to it
4. screenshot with actions: [wait 2000ms]
   → "The blue sphere is there but it's intersecting the cube. Let me adjust the position."
5. Fix the position, screenshot again
   → "Both objects are now properly placed side by side."
```

## Scene Layout Awareness

- Each **parcel** is 16×16 meters. A 1×1 scene has coordinates 0-16 in X and Z.
- **Y is up**. Ground level is Y=0.
- The avatar **spawns near the south-west corner** (low X, low Z).
- Objects at the **center** of a 1×1 scene are at roughly (8, 0, 8).
- The **minimap** in the top-left corner shows coordinates and a compass.

For a 2×2 scene (32×32m), center is (16, 0, 16) and the avatar needs to walk ~14m north and east to reach it.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Screenshot shows welcome screen | The scene hasn't loaded yet — increase `wait` time |
| Black/empty screenshot | Preview server may have crashed — check `/tasks` |
| Objects not visible | They may be behind the camera (south of avatar) — use `moveBack` or `lookLeft`/`lookRight` to find them |
| Scene looks different after code change | Hot reload takes ~1-2s — add a `wait` action of 2000ms |
| "No preview server running" | Start it with `/preview` first |

## Tips

- **First screenshot is slow** (~15s) because it launches a browser and enters the scene. After that, screenshots are instant.
- **The browser persists** across all screenshot calls in the session — no repeated logins.
- **Don't over-move** — keep `holdMs` values short (300-800ms) to avoid overshooting targets.
- **Hot reload** — after writing code, wait ~2s before screenshotting to let the scene update.
- **Describe honestly** — if something looks wrong, say so. The user trusts your visual assessment.
