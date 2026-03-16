---
name: deploy-worlds
description: Deploy a Decentraland scene to a World (personal 3D space using a DCL NAME or ENS domain). Covers worldConfiguration setup, Places listing opt-out, and common deployment errors. Use when the user wants to deploy to a World, publish to a personal space, or use a DCL NAME/ENS domain. Do NOT use for Genesis City LAND deployment (see deploy-scene).
---

# Deploying to Decentraland Worlds

Worlds are personal 3D spaces not tied to LAND. They have no parcel limitations and are automatically listed on the Places page.

## Requirements

To publish to a World, the user must own either:
- A **Decentraland NAME** (e.g., `my-name.dcl.eth`)
- An **ENS domain** (e.g., `my-name.eth`)

The wallet signing the deployment must own the NAME, or have been granted permission via Access Control Lists (ACL).

## 1. Configure scene.json

Add a `worldConfiguration` section to `scene.json`:

```json
{
  "worldConfiguration": {
    "name": "my-name.dcl.eth"
  }
}
```

The `name` field must match a Decentraland NAME or ENS domain owned by the deploying wallet.

### Opt out of Places listing

All Worlds are automatically listed on the [Places page](https://places.decentraland.org). To opt out:

```json
{
  "worldConfiguration": {
    "name": "my-name.dcl.eth",
    "placesConfig": {
      "optOut": true
    }
  }
}
```

## 2. Deploy

**Use the `/deploy` command** — it auto-detects the `worldConfiguration` in scene.json and deploys to the Worlds content server automatically.

Alternatively, deploy manually via CLI:

```bash
npx @dcl/sdk-commands deploy --target-content https://worlds-content-server.decentraland.org
```

This will prompt the user to sign the deployment with their wallet. Validations run automatically to allow or reject the scene.

### Via Creator Hub

1. Open the scene project in Creator Hub
2. Click the **Publish** button (top-right corner)
3. Select **PUBLISH TO WORLD**
4. Choose which NAME or ENS domain to publish to

## 3. Access the World

After a successful deploy, the `/deploy` command outputs a visit URL automatically. The World is also accessible at:

```
https://decentraland.zone/bevy-web?realm=NAME.dcl.eth
```

From inside Decentraland, use the chatbox command:
```
/goto NAME.dcl.eth
```

## Full scene.json Example

```json
{
  "ecs7": true,
  "runtimeVersion": "7",
  "display": {
    "title": "My World",
    "description": "A personal 3D space"
  },
  "scene": {
    "parcels": ["0,0"],
    "base": "0,0"
  },
  "main": "bin/index.js",
  "worldConfiguration": {
    "name": "my-name.dcl.eth"
  }
}
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "NAME not found" or "NAME not owned" | The wallet signing the deployment doesn't own the NAME/ENS in `worldConfiguration.name` | Verify NAME ownership at `https://builder.decentraland.org/names`. The wallet used for signing must own the exact NAME |
| ENS resolution fails | ENS domain not registered or expired | Check ENS registration at `https://app.ens.domains` |
| "Scene too large" | World scenes have size limits even though parcels aren't constrained | Reduce asset sizes. Worlds still enforce file size and entity limits |
| Deploy succeeds but world is empty | `main` field misconfigured | Ensure `main` is `"bin/index.js"` and code compiles |
| World not showing on Places | Propagation delay | Wait a few minutes after deployment. If opted out via `placesConfig.optOut`, it won't appear |

> **Deploying to Genesis City instead?** See the **deploy-scene** skill.

## Key Differences from Genesis City

- **No parcel limitations** — Worlds are not constrained by LAND ownership
- **NAME/ENS required** — must own a Decentraland NAME or ENS domain instead of LAND
- **Different deploy target** — uses `--target-content https://worlds-content-server.decentraland.org`
- **Auto-listed on Places** — unless opted out via `placesConfig.optOut`
