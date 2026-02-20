---
name: create-scene
description: Scaffold a new Decentraland SDK7 scene project from scratch. Creates scene.json, package.json, tsconfig.json, and src/index.ts with a basic scene setup. Use when user wants to start a new scene, initialize a project, or set up from an empty folder.
---

# Create a New Decentraland SDK7 Scene

When the user wants to create a new scene, follow these steps:

## 1. Ask What They Want to Build

If the user hasn't described their scene, ask them:
- What kind of scene? (gallery, game, social space, interactive art, etc.)
- How many parcels? (default: 1 parcel = 16x16m)
- Any specific features? (3D models, interactivity, UI, multiplayer)

## 2. Scaffold the Project with `/init`

**Always run `/init` first.** This uses the official `@dcl/sdk-commands init` to create scene.json, package.json, tsconfig.json, and src/index.ts with the correct, up-to-date configuration.

Never manually create scene.json, package.json, or tsconfig.json — the SDK templates may change between versions and hand-written copies will diverge.

## 3. Customize the Generated Files

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

## 4. Post-Creation Steps

After creating the files, tell the user:
1. Run `npm install` to install dependencies
2. Use the `preview` tool to start the preview server (or run `npx @dcl/sdk-commands start --bevy-web` manually)
3. The scene will open in a browser at http://localhost:8000

## Important Notes

- Always place objects within the scene boundaries (0 to 16*parcelsX for X, 0 to 16*parcelsZ for Z)
- Center of a single-parcel scene is (8, 0, 8) at ground level
- Y axis is up, minimum Y=0 (ground)
- The `main` field in scene.json MUST be `"bin/index.js"` — this is the compiled output path
- The `jsx` and `jsxImportSource` in tsconfig are required for React-ECS UI support
