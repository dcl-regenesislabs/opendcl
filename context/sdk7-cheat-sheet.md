# SDK7 Cheat Sheet

Quick reference for Decentraland SDK7 fundamentals. For detailed API usage, see the relevant skill.

## Imports

```typescript
import { engine, Entity, Transform, GltfContainer, MeshRenderer, MeshCollider,
  Material, AudioSource, VideoPlayer, TextShape, Animator, Tween, TweenSequence,
  Billboard, VisibilityComponent, PointerEvents, Raycast, RaycastResult,
  AvatarAttach, AvatarModifierArea, NftShape, CameraModeArea, VirtualCamera,
  pointerEventsSystem, tweenSystem, inputSystem, raycastSystem,
  InputAction, ColliderLayer, AvatarAnchorPointType, CameraType,
  syncEntity, parentEntity, removeEntityWithChildren,
  executeTask, Schemas } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4, Matrix } from '@dcl/sdk/math'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input, Dropdown } from '@dcl/sdk/react-ecs'
import { movePlayerTo, teleportTo, triggerEmote, changeRealm,
  openExternalUrl, openNftDialog, triggerSceneEmote,
  copyToClipboard } from '~system/RestrictedActions'
import { getSceneInformation, getRealm, readFile } from '~system/Runtime'
import { getWorldTime, getExplorerInformation } from '~system/EnvironmentApi'
import { signedFetch, getHeaders } from '~system/SignedFetch'
import { getPlayer } from '@dcl/sdk/src/players'
```

## ECS Core

```typescript
// Entities
const entity = engine.addEntity()
engine.removeEntity(entity)
removeEntityWithChildren(engine, entity)

// Components — CRUD
Transform.create(entity, { position: Vector3.create(8, 1, 8) })
const t = Transform.get(entity)           // read-only, throws if missing
const t = Transform.getMutable(entity)     // mutable reference
const t = Transform.getOrNull(entity)      // read-only, returns null if missing
Transform.has(entity)                      // boolean
Transform.deleteFrom(entity)               // remove component
Transform.createOrReplace(entity, { ... }) // upsert

// Systems
engine.addSystem((dt: number) => { /* runs every frame */ })
engine.addSystem(mySystem, priority)       // higher priority = runs first
engine.removeSystem(mySystem)

// Queries
for (const [entity, transform, mesh] of engine.getEntitiesWith(Transform, MeshRenderer)) {
  // iterate entities that have both components
}
```

## Custom Components

```typescript
const MyComponent = engine.defineComponent('game::MyComponent', {
  score: Schemas.Int,
  label: Schemas.String,
  active: Schemas.Boolean,
  speed: Schemas.Float,
  position: Schemas.Vector3,
  color: Schemas.Color4,
  items: Schemas.Array(Schemas.String),
  data: Schemas.Map({ key: Schemas.String }),
  opt: Schemas.Optional(Schemas.Int),
  kind: Schemas.EnumNumber<MyEnum>(MyEnum, MyEnum.Default),
  choice: Schemas.OneOf({ str: Schemas.String, num: Schemas.Int }),
  timestamp: Schemas.Int64,  // use Int64 for Date.now() values
})
```

## Reserved Entities

```typescript
engine.PlayerEntity   // the local player
engine.CameraEntity   // the camera
engine.RootEntity     // scene root (parent of all top-level entities)
```

## Math Utilities

```typescript
// Vector3
Vector3.create(x, y, z)
Vector3.add(a, b)        Vector3.subtract(a, b)
Vector3.scale(v, n)      Vector3.normalize(v)
Vector3.distance(a, b)   Vector3.lerp(a, b, t)
Vector3.rotate(v, q)     Vector3.Zero()  Vector3.One()  Vector3.Up()

// Quaternion
Quaternion.fromEulerDegrees(x, y, z)
Quaternion.fromAngleAxis(degrees, axis)
Quaternion.lookRotation(forward, up?)
Quaternion.multiply(a, b)
Quaternion.toEulerAngles(q)
Quaternion.slerp(a, b, t)
Quaternion.Zero()  Quaternion.Identity()

// Color
Color3.create(r, g, b)          // 0-1 range
Color4.create(r, g, b, a)       // 0-1 range
Color4.Red() .Green() .Blue() .White() .Black() .Yellow() .Gray() .Purple()
```

## ColliderLayer Enum

```typescript
ColliderLayer.CL_NONE        // no collision
ColliderLayer.CL_POINTER     // responds to pointer events / raycasts
ColliderLayer.CL_PHYSICS     // blocks player movement
ColliderLayer.CL_CUSTOM1 … CL_CUSTOM8  // user-defined layers
```

## scene.json Schema

```json
{
  "ecs7": true,
  "runtimeVersion": "7",
  "display": { "title": "Scene Title", "description": "...", "navmapThumbnail": "thumbnail.png" },
  "scene": { "parcels": ["0,0", "1,0"], "base": "0,0" },
  "main": "bin/index.js",
  "contact": { "name": "Author", "email": "email@example.com" },
  "tags": ["game", "art"],
  "spawnPoints": [
    { "name": "spawn1", "default": true, "position": { "x": [1, 5], "y": [0, 0], "z": [2, 4] }, "cameraTarget": { "x": 8, "y": 1, "z": 8 } }
  ],
  "requiredPermissions": [
    "ALLOW_TO_MOVE_PLAYER_INSIDE_SCENE",
    "ALLOW_TO_TRIGGER_AVATAR_EMOTE",
    "ALLOW_MEDIA_HOSTNAMES"
  ],
  "allowedMediaHostnames": ["video.example.com"],
  "featureToggles": { "voiceChat": "enabled" },
  "worldConfiguration": {
    "name": "my-world.dcl.eth",
    "skyboxConfig": { "fixedHour": 14.0 }
  }
}
```

## Scene Limits (by parcel count)

| Parcels | Entities | Triangles | Textures (MB) | Materials | Bodies | Height (m) |
|---------|----------|-----------|---------------|-----------|--------|------------|
| 1       | 512      | 10,000    | 10            | 20        | 64     | 20         |
| 2       | 1,024    | 10,000    | 10            | 20        | 64     | 20         |
| 4       | 2,048    | 20,000    | 20            | 40        | 128    | 40         |
| 9       | 4,096    | 40,000    | 40            | 80        | 256    | 40         |
| 16      | 4,096    | 40,000    | 40            | 80        | 256    | 40         |

## Runtime Restrictions

- **Sandboxed QuickJS** — no Node.js APIs (`fs`, `http`, `path`, `process`)
- **setTimeout/setInterval** — supported (runtime polyfill)
- **fetch** — supported (plain and signed)
- **WebSocket** — supported
- **Entry point** — `export function main() {}` in `src/index.ts`
- **All coordinates** — in meters, Y is up, origin at southwest corner of base parcel
