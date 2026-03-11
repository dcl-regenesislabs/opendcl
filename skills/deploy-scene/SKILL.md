---
name: deploy-scene
description: Deploy a Decentraland scene to Genesis City (LAND-based). Covers pre-deployment checklist, scene.json validation, spawn points, and common deployment errors. Use when the user wants to deploy, publish, go live, or upload to parcels they own. Do NOT use for Worlds deployment (see deploy-worlds).
---

# Deploying to Genesis City

Deploy to specific parcels you own or have permission to deploy to.

**Use the `/deploy` command** to deploy. It runs `npx @dcl/sdk-commands deploy` and handles the full process:
1. Build the scene
2. Upload assets to IPFS
3. Deploy to the specified parcels
4. Requires a wallet with LAND or deployment permissions

> **Deploying to a World instead?** See the `deploy-worlds` skill for Worlds deployment (personal spaces using DCL NAMEs or ENS domains).

## Pre-Deployment Checklist

Before deploying, verify:

1. **scene.json is valid**:
   - `ecs7: true` and `runtimeVersion: "7"`
   - Correct `parcels` matching your LAND (for Genesis City)
   - Valid `base` parcel
   - `main: "bin/index.js"`

2. **Code compiles**:
   ```bash
   npx tsc --noEmit
   ```

3. **Scene previews correctly**:
   Use the `preview` tool to verify the scene works (or `npx @dcl/sdk-commands start --bevy-web` manually)

4. **Dependencies installed**:
   ```bash
   npm install
   ```

5. **Assets are within limits** — see the **optimize-scene** skill for full limit formulas per parcel count (triangles, entities, materials, textures, height)

## Deployment Process

### Using CLI
```bash
# Build first
npx @dcl/sdk-commands build

# Deploy (will open browser for wallet connection)
npx @dcl/sdk-commands deploy
```

### Using Creator Hub
1. Open Creator Hub
2. Select your scene
3. Click "Publish"
4. Connect wallet
5. Confirm transaction

## scene.json for Deployment

```json
{
  "ecs7": true,
  "runtimeVersion": "7",
  "display": {
    "title": "My Awesome Scene",
    "description": "A description for the marketplace",
    "navmapThumbnail": "images/thumbnail.png"
  },
  "scene": {
    "parcels": ["0,0", "0,1"],
    "base": "0,0"
  },
  "main": "bin/index.js"
}
```

### Spawn Points

Configure where players appear when entering the scene:

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

Position ranges (e.g., `[1, 5]`) spawn players randomly within the range. Use `cameraTarget` to orient the player's camera on spawn.

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "You don't have permission to deploy" | Wallet doesn't own the target LAND/parcels | Verify LAND ownership on the marketplace, or get deployment permissions from the LAND owner |
| "Scene is too large" | Assets exceed parcel size limits | Check triangle count, file sizes, and texture counts against the limits table above. See **optimize-scene** skill |
| Wallet connection fails | Browser popup blocked or MetaMask locked | Allow popups, unlock MetaMask, refresh and try again |
| "Invalid scene.json" | Missing required fields or malformed JSON | Verify `ecs7: true`, `runtimeVersion: "7"`, valid `parcels` array, and `main: "bin/index.js"` |
| Deploy succeeds but scene is empty | `main` field doesn't point to compiled output | Ensure `main` is `"bin/index.js"` and run `npx @dcl/sdk-commands build` first |
| Catalyst rejection | Content violates Decentraland content policies | Review content guidelines at docs.decentraland.org |

### Genesis City vs Worlds

| | Genesis City | Worlds |
|-|-------------|--------|
| **Requirement** | Own LAND parcels | Own DCL NAME or ENS domain |
| **Parcel limits** | Enforced (entity/triangle budgets per parcel) | Not constrained by LAND |
| **Visibility** | Shown on the Genesis City map | Listed on Places page (opt-out available) |
| **Deploy target** | Default Catalyst network | `--target-content https://worlds-content-server.decentraland.org` |
| **Best for** | Permanent installations, high-traffic scenes | Testing, personal spaces, events |

> **Deploying to a World instead?** See the **deploy-worlds** skill.

## Best Practices

- Always preview locally before deploying
- Use a thumbnail image (`navmapThumbnail`) for the Genesis City map
- Write a clear description for discovery
- Test with multiple browser tabs to verify multiplayer behavior
- Keep scene load time under 15 seconds (optimize assets)
