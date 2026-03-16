---
name: visual-feedback
description: Capture screenshots of the running Decentraland preview to verify scene changes visually. Covers camera movement, interaction actions, and visual debugging. Use when the preview is running and you need to check what the scene looks like, debug visual issues, or verify layout. Do NOT use for code changes (make changes first, then screenshot).
---

# Visual Feedback — Seeing Your Scene

The `screenshot` tool lets you capture what the Decentraland preview looks like right now. The browser stays open between calls — only the first screenshot takes ~15s (launch + enter scene). After that, screenshots are instant.

**Prerequisites:** The preview server must be running (`/preview`). The tool auto-detects the preview URL.

## When to Use Screenshots

- **After completing code changes** — verify the final result looks correct
- **When the user asks "how does it look?"** — show them and describe what you see
- **When debugging visual issues** — "the tree is invisible" → screenshot to see what's actually rendering

**Do NOT** use screenshots to explore or navigate the scene. Make all code changes first, then take 1-2 screenshots to verify.

## Basic Usage

Take a screenshot of the current view:

```
Use the screenshot tool with no actions to capture the current scene view.
```

The tool returns the image directly — you'll see it and can describe what's visible.

## Movement & Camera

The scene camera **always faces north** in headless mode. Movement is relative to compass direction, not camera:

| Action | Direction | Key |
|--------|-----------|-----|
| `moveForward` | North (toward top of screen) | W |
| `moveBack` | South (toward bottom) | S |
| `moveRight` | East (toward right) | D |
| `moveLeft` | West (toward left) | A |

Movement speed is ~6 meters/second. Default `holdMs` is 300ms (~1.8 meters).

### Camera rotation

Use look actions to rotate the camera view (arrow key holds):

| Action | Effect |
|--------|--------|
| `lookLeft` | Rotate camera left |
| `lookRight` | Rotate camera right |
| `lookUp` | Tilt camera up |
| `lookDown` | Tilt camera down |

Default rotation hold is 300ms. Use `holdMs` for more or less rotation.

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

## Workflow

1. **Make all code changes** (write to `src/index.ts`)
2. **Take one screenshot** with `wait: 2000` to let hot-reload settle
3. **Evaluate** — describe honestly: what works, what's wrong
4. **Fix if needed** — then take one more screenshot to confirm

Keep it to 1-2 screenshots per task. Each screenshot consumes significant tokens.

## Scene Layout Awareness

- Each **parcel** is 16×16 meters. A 1×1 scene has coordinates 0-16 in X and Z.
- **Y is up**. Ground level is Y=0.
- The avatar **spawns near the south-west corner** (low X, low Z).
- Objects at the **center** of a 1×1 scene are at roughly (8, 0, 8).

**WARNING:** If you see empty/gray space, "No scene", or no content — you've walked outside the scene boundaries. STOP moving. Keep movements small (holdMs: 300).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Screenshot shows welcome screen | The scene hasn't loaded yet — increase `wait` time |
| Black/empty screenshot | Preview server may have crashed — check `/tasks` |
| Objects not visible | They may be behind the camera (south of avatar) — use `moveBack` or `lookLeft`/`lookRight` to find them |
| Scene looks different after code change | Hot reload takes ~1-2s — add a `wait` action of 2000ms |
| "No preview server running" | Start it with `/preview` first |
| Empty/gray space, no scene content | You've left the scene boundaries — stop moving |
| Z-fighting (flickering surfaces) | Two surfaces at the same position | Move one surface slightly (0.01m) away from the other |
| Missing textures (pink/magenta) | Texture file not found or wrong path | Verify file exists in project and path matches code |
| Objects appear wrong scale | Scale values off or model exported at wrong scale | Check Transform.scale values; 1,1,1 is original model size |
| Lighting looks flat | No LightSource components in scene | Add point or spot lights — see **lighting-environment** skill |

## What to Look For in Screenshots

When evaluating a screenshot, check these common issues:

- **Missing objects** — entity exists in code but not visible. Check: wrong position (behind camera, underground, outside parcels), scale of 0, VisibilityComponent set to false
- **Z-fighting** — flickering or shimmering where two surfaces overlap. Fix: offset one surface by 0.01m
- **Texture issues** — pink/magenta means missing texture file, black means missing material, white means missing texture coordinates
- **Scale problems** — objects too large (clipping through ceiling) or too small (invisible dots). Compare against parcel size (16m x 16m)
- **Lighting** — very flat/uniform usually means no custom lights. Dark scene may need SkyboxTime adjustment
- **UI elements** — check that HUD elements are positioned correctly and text is readable

## Tips

- **First screenshot is slow** (~15s) because it launches a browser and enters the scene. After that, screenshots are instant.
- **The browser persists** across all screenshot calls in the session — no repeated logins.
- **Keep movements small** — use `holdMs: 300` (default) to avoid walking out of the scene.
- **Hot reload** — after writing code, wait ~2s before screenshotting to let the scene update.
- **Describe honestly** — if something looks wrong, say so. The user trusts your visual assessment.
