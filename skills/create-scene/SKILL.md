---
name: create-scene
description: Scaffold a new Decentraland SDK7 scene project. Creates scene.json, package.json, tsconfig.json, and src/index.ts. Covers scene.json schema (parcels, spawnPoints, permissions, featureToggles), multi-parcel layouts, and project structure. Use when the user wants to start a new scene, create a project, or set up from scratch. Do NOT use for deployment (see deploy-scene or deploy-worlds).
---

# Create a New Decentraland SDK7 Scene

> **Runtime constraint:** Decentraland runs in a QuickJS sandbox. No Node.js APIs (`fs`, `http`, `path`, `process`). Use the SDK's `executeTask()` + `fetch()` for async work. See the **scene-runtime** skill for details.

When the user wants to create a new scene, follow these steps:

## 1. Ask What They Want to Build

If the user hasn't described their scene, ask them:
- What kind of scene? (gallery, game, social space, interactive art, etc.)
- How many parcels? (default: 1 parcel = 16x16m)
- Any specific features? (3D models, interactivity, UI, multiplayer)

## 2. Scaffold the Project with `/init`

**Always run `/init` first.** This uses the official `@dcl/sdk-commands init` to create scene.json, package.json, tsconfig.json, and src/index.ts with the correct, up-to-date configuration, and installs dependencies automatically.

Never manually create scene.json, package.json, or tsconfig.json — the SDK templates may change between versions and hand-written copies will diverge.

## 3. Find Matching 3D Assets

Before writing scene code, check both asset catalogs for free models that match the user's theme:

1. Read `{baseDir}/../../context/asset-packs-catalog.md` (2,700+ Creator Hub models — furniture, structures, decorations, nature, etc.)
2. Read `{baseDir}/../../context/open-source-3d-assets.md` (991 CC0 models — cyberpunk, medieval, nature, sci-fi, etc.)
3. Read `{baseDir}/../../context/audio-catalog.md` (50 free sounds — music, ambient, SFX, game mechanics, etc.)
4. Suggest matching models and sounds to the user
5. Download selected models into the scene's `models/` directory:
   ```bash
   mkdir -p models
   curl -o models/arcade_machine.glb "https://builder-items.decentraland.org/contents/bafybei..."
   ```

> **Important**: `GltfContainer` only works with local files. Never use external URLs for the model `src` field.

## 4. Customize the Generated Files

After `/init` completes, customize the generated files based on what the user wants:

### scene.json
Update the `display` fields and parcels:
- `display.title` — set to the scene name
- `display.description` — set to a short description
- `scene.parcels` — for multi-parcel scenes, list all parcels (e.g., `["0,0", "0,1", "1,0", "1,1"]` for 2x2)
- `scene.base` — set to the southwest corner parcel

### src/index.ts
Replace the generated code with the user's scene. Example:

```typescript
import { engine, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'

export function main() {
  // Create a cube at the center of the scene
  const cube = engine.addEntity()
  Transform.create(cube, {
    position: Vector3.create(8, 1, 8)
  })
  MeshRenderer.setBox(cube)
  Material.setPbrMaterial(cube, {
    albedoColor: Color4.create(0.2, 0.5, 1, 1)
  })
}
```

### scene.json Reference

All valid `scene.json` fields:

| Field | Required | Description |
|-------|----------|-------------|
| `ecs7` | Yes | Must be `true` for SDK7 |
| `runtimeVersion` | Yes | Must be `"7"` |
| `main` | Yes | Must be `"bin/index.js"` — the compiled output path |
| `display.title` | Recommended | Scene name shown in the map and Places |
| `display.description` | Recommended | Short description for discovery |
| `display.navmapThumbnail` | Optional | Image path for the Genesis City minimap |
| `scene.parcels` | Yes | Array of `"x,y"` coordinate strings |
| `scene.base` | Yes | The origin parcel (usually southwest corner) |
| `spawnPoints` | Optional | Where players appear when entering (see below) |
| `requiredPermissions` | Optional | Array of permissions (e.g., `"ALLOW_MEDIA_HOSTNAMES"`) |
| `allowedMediaHostnames` | Optional | Whitelisted domains for external media |
| `featureToggles` | Optional | Enable/disable SDK features |
| `worldConfiguration` | Optional | For Worlds deployment (see **deploy-worlds** skill) |
| `authoritativeMultiplayer` | Optional | Enable authoritative server mode (see **authoritative-server** skill) |

### Spawn Points

Configure where and how players enter the scene:

```json
{
  "spawnPoints": [
    {
      "name": "spawn1",
      "default": true,
      "position": { "x": [1, 5], "y": [0, 0], "z": [2, 4] },
      "cameraTarget": { "x": 8, "y": 1, "z": 8 }
    }
  ]
}
```

- Position ranges (e.g., `[1, 5]`) spawn players randomly within the range
- `cameraTarget` orients the player's camera on spawn — point it at the scene's focal area
- Fixed spawn: use single values instead of ranges (e.g., `"x": 8`)

### Multi-Parcel Layouts

| Layout | Parcels Array | Use Case |
|--------|--------------|----------|
| **Single** | `["0,0"]` | Small games, galleries, single-room experiences |
| **Strip** | `["0,0", "1,0", "2,0"]` | Hallways, racing tracks, linear journeys |
| **L-Shape** | `["0,0", "1,0", "0,1"]` | Corner buildings, split experiences |
| **2x2 Square** | `["0,0", "1,0", "0,1", "1,1"]` | Open plazas, arenas, medium games |
| **3x3 Square** | 9 parcels from `"0,0"` to `"2,2"` | Large games, multi-room buildings |

**Base parcel:** Always set `scene.base` to the southwest (lowest x,y) corner parcel.

**Boundaries per parcel:** 16m x 16m x 20m height. A 2x2 scene spans 32m x 32m.

## 5. Post-Creation Steps

After customizing the files:
1. Use the `preview` tool to start the preview server (or run `npx @dcl/sdk-commands start --bevy-web` manually)
2. The scene will open in a browser at http://localhost:8000

## Cross-References

- Ready to deploy? See the **deploy-scene** skill (Genesis City) or **deploy-worlds** skill (personal Worlds)
- Need to optimize for parcel limits? See the **optimize-scene** skill
- Planning a game? See the **game-design** skill for design patterns and performance budgets

## Important Notes

- Always place objects within the scene boundaries (0 to 16*parcelsX for X, 0 to 16*parcelsZ for Z)
- Center of a single-parcel scene is (8, 0, 8) at ground level
- Y axis is up, minimum Y=0 (ground)
- The `main` field in scene.json MUST be `"bin/index.js"` — this is the compiled output path
- The `jsx` and `jsxImportSource` tsconfig settings are already included by `/init` — do not modify them
