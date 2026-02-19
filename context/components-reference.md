# Decentraland SDK7 Components Quick Reference

All components are imported from `@dcl/sdk/ecs`.

## Transform & Positioning

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **Transform** | `position: Vector3`, `rotation: Quaternion`, `scale: Vector3`, `parent?: Entity` | Position, rotation, and scale of an entity. Parent for hierarchy. |

## 3D Rendering

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **MeshRenderer** | Static methods: `setBox()`, `setSphere()`, `setCylinder()`, `setPlane()` | Renders primitive 3D shapes. |
| **MeshCollider** | Static methods: `setBox()`, `setSphere()`, `setCylinder()`, `setPlane()` | Adds collision geometry for physics/pointer events. |
| **Material** | Static methods: `setPbrMaterial({ albedoColor, metallic, roughness, texture })`, `setBasicMaterial()` | PBR or unlit material for meshes. |
| **GltfContainer** | `src: string`, `visibleMeshesCollisionMask?`, `invisibleMeshesCollisionMask?` | Loads a .glb/.gltf 3D model file. |
| **GltfContainerLoadingState** | `currentState` | Read-only loading state for GLTF models. |
| **GltfNodeModifiers** | `nodes: Array<{ path, visibleMeshes, invisibleMeshes }>` | Modify visibility of specific nodes in GLTF. |
| **Billboard** | `billboardMode: BillboardMode` | Makes entity always face the camera. |
| **VisibilityComponent** | `visible: boolean` | Show/hide entity without removing it. |
| **NftShape** | `src: string (urn)`, `style?` | Display an NFT artwork frame. |
| **TextShape** | `text: string`, `fontSize?: number`, `textColor?: Color4`, `font?: Font` | Render 3D text in the scene. |
| **LightSource** | `type`, `color`, `intensity`, `range`, `innerAngle`, `outerAngle`, `shadows` | Add point, spot, or directional lights. |

## Interaction & Input

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **PointerEvents** | `pointerEvents: Array<{ eventType, eventInfo: { button, hoverText, maxDistance } }>` | Define clickable/hoverable areas. Use `pointerEventsSystem.onPointerDown()` helper. |
| **PointerEventsResult** | Read-only | Results of pointer events (which button, hit point). |
| **PointerLock** | `isPointerLocked: boolean` | Whether pointer is locked (first-person mode). |
| **PrimaryPointerInfo** | Read-only | Position and entity of the primary pointer. |
| **InputModifier** | `mode` | Modify input behavior for the entity. |
| **Raycast** | `direction`, `maxDistance`, `queryType`, `continuous` | Cast rays for collision detection. |
| **RaycastResult** | Read-only | Results of a raycast (hits, distances). |
| **TriggerArea** | `area: { box }`, `layerMask` | Define trigger volumes that detect player entry. |
| **TriggerAreaResult** | Read-only | Which entities are inside the trigger. |

## Animation & Movement

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **Animator** | `states: Array<{ clip, playing, loop, speed, weight }>` | Play animations embedded in GLTF models. |
| **Tween** | `mode: { move, rotate, scale }`, `duration`, `easingFunction`, `currentTime` | Animate entity properties over time. |
| **TweenSequence** | `sequence: Array<{ ... }>`, `loop` | Chain multiple tweens together. |
| **TweenState** | Read-only | Current state of a tween. |

## Audio & Video

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **AudioSource** | `audioClipUrl: string`, `playing: boolean`, `loop: boolean`, `volume: number`, `pitch: number` | Play audio clips (.mp3, .ogg, .wav). |
| **AudioStream** | `url: string`, `playing: boolean`, `volume: number` | Stream audio from a URL. |
| **AudioEvent** | Read-only | Audio playback events. |
| **VideoPlayer** | `src: string`, `playing: boolean`, `loop: boolean`, `volume: number`, `playbackRate: number` | Play video on a surface. Requires `Material` with video texture. |
| **VideoEvent** | Read-only | Video playback events. |

## Player & Avatar

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **PlayerIdentityData** | `address: string`, `isGuest: boolean` | Player's wallet address and guest status. |
| **AvatarShape** | `id: string`, `name: string`, `bodyShape`, `wearables`, `emotes` | Render an avatar (for NPCs). |
| **AvatarBase** | `skinColor`, `eyeColor`, `hairColor`, `bodyShapeUrn` | Base avatar appearance. |
| **AvatarAttach** | `avatarId: string`, `anchorPointId` | Attach an entity to a player's avatar. |
| **AvatarModifierArea** | `area`, `modifiers: Array<AvatarModifierType>` | Modify avatars in an area (hide, freeze). |
| **AvatarEmoteCommand** | `emoteUrn`, `loop` | Trigger avatar emotes. |
| **AvatarEquippedData** | Read-only | Data about equipped wearables. |

## Camera

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **CameraMode** | `mode: CameraType` | Set camera to first-person or third-person. |
| **CameraModeArea** | `area`, `mode` | Force camera mode in an area. |
| **MainCamera** | Read-only | Access main camera position/rotation. |
| **VirtualCamera** | `lookAtEntity?`, `defaultTransition` | Create cinematic camera angles. |

## UI Components (React-ECS)

Imported from `@dcl/sdk/react-ecs`:

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **UiTransform** | `width`, `height`, `positionType`, `flexDirection`, `alignItems`, `justifyContent`, `margin`, `padding`, `position` | Layout and positioning (CSS flexbox-like). |
| **UiText** | `value: string`, `fontSize`, `color`, `textAlign`, `font` | Render text in UI. |
| **UiBackground** | `color?`, `textureMode?`, `texture?` | Background color or image for UI elements. |
| **UiInput** | `placeholder`, `fontSize`, `color`, `onSubmit` | Text input field. |
| **UiInputResult** | Read-only | Input field value. |
| **UiDropdown** | `options: string[]`, `selectedIndex`, `onChange` | Dropdown selector. |
| **UiDropdownResult** | Read-only | Selected dropdown value. |
| **UiCanvasInformation** | Read-only | Screen dimensions and device pixel ratio. |

## System & Runtime

| Component | Key Fields | Description |
|-----------|-----------|-------------|
| **EngineInfo** | Read-only: `tickNumber`, `totalRuntime`, `frameNumber` | Engine timing information. |
| **RealmInfo** | Read-only: `realmName`, `networkId`, `baseUrl` | Current realm/server info. |
| **SkyboxTime** | `time` | Control the time of day (skybox). |
| **AssetLoad** | `src`, `type` | Request loading of external assets. |
| **AssetLoadLoadingState** | Read-only | Loading state of external assets. |

## Math Types (from `@dcl/sdk/math`)

| Type | Factory | Description |
|------|---------|-------------|
| **Vector3** | `Vector3.create(x, y, z)`, `.Zero()`, `.One()`, `.Up()`, `.Forward()` | 3D position/direction. |
| **Quaternion** | `Quaternion.fromEulerDegrees(x, y, z)`, `.Identity()` | Rotation. |
| **Color4** | `Color4.create(r, g, b, a)`, `.Red()`, `.Blue()`, `.Green()`, `.White()`, `.Black()` | RGBA color (0-1 range). |
| **Color3** | `Color3.create(r, g, b)` | RGB color. |
