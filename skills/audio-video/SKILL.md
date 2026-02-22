---
name: audio-video
description: Add audio sources, sound effects, music, audio streaming, and video players to Decentraland scenes. Use when user wants sound, music, audio, video screens, speakers, or media playback.
---

# Audio and Video in Decentraland

## Audio Source (Sound Effects & Music)

Play audio clips from files:

```typescript
import { engine, Transform, AudioSource } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const speaker = engine.addEntity()
Transform.create(speaker, { position: Vector3.create(8, 1, 8) })

AudioSource.create(speaker, {
  audioClipUrl: 'sounds/music.mp3',
  playing: true,
  loop: true,
  volume: 0.5,   // 0 to 1
  pitch: 1.0     // Playback speed (0.5 = half speed, 2.0 = double)
})
```

### Supported Formats
- `.mp3` (recommended)
- `.ogg`
- `.wav`

### File Organization
```
project/
├── sounds/
│   ├── click.mp3
│   ├── background-music.mp3
│   └── explosion.ogg
├── src/
│   └── index.ts
└── scene.json
```

### Play/Stop/Toggle
```typescript
// Play
AudioSource.getMutable(speaker).playing = true

// Stop
AudioSource.getMutable(speaker).playing = false

// Toggle
const audio = AudioSource.getMutable(speaker)
audio.playing = !audio.playing
```

### Play on Click
```typescript
import { pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'

const button = engine.addEntity()
// ... set up transform and mesh ...

const audioEntity = engine.addEntity()
Transform.create(audioEntity, { position: Vector3.create(8, 1, 8) })
AudioSource.create(audioEntity, {
  audioClipUrl: 'sounds/click.mp3',
  playing: false,
  loop: false,
  volume: 0.8
})

pointerEventsSystem.onPointerDown(
  { entity: button, opts: { button: InputAction.IA_POINTER, hoverText: 'Play sound' } },
  () => {
    // Reset and play
    const audio = AudioSource.getMutable(audioEntity)
    audio.playing = false
    audio.playing = true
  }
)
```

## Audio Streaming

Stream audio from a URL (radio, live streams):

```typescript
import { engine, Transform, AudioStream } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

const radio = engine.addEntity()
Transform.create(radio, { position: Vector3.create(8, 1, 8) })

AudioStream.create(radio, {
  url: 'https://example.com/stream.mp3',
  playing: true,
  volume: 0.3
})
```

## Video Player

Play video on a surface:

```typescript
import { engine, Transform, VideoPlayer, Material, MeshRenderer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// Create a screen
const screen = engine.addEntity()
Transform.create(screen, {
  position: Vector3.create(8, 3, 15.9),
  scale: Vector3.create(8, 4.5, 1)  // 16:9 ratio
})
MeshRenderer.setPlane(screen)

// Add video player
VideoPlayer.create(screen, {
  src: 'https://example.com/video.mp4',
  playing: true,
  loop: true,
  volume: 0.5,
  playbackRate: 1.0,
  position: 0  // Start time in seconds
})

// Create video texture
const videoTexture = Material.Texture.Video({ videoPlayerEntity: screen })

// Basic material (recommended — better performance)
Material.setBasicMaterial(screen, {
  texture: videoTexture
})
```

### Video Controls
```typescript
// Play
VideoPlayer.getMutable(screen).playing = true

// Pause
VideoPlayer.getMutable(screen).playing = false

// Change volume
VideoPlayer.getMutable(screen).volume = 0.8

// Change source
VideoPlayer.getMutable(screen).src = 'https://example.com/other.mp4'
```

### Enhanced Video Material (PBR)

For a brighter, emissive video screen:

```typescript
import { Color3 } from '@dcl/sdk/math'

const videoTexture = Material.Texture.Video({ videoPlayerEntity: screen })
Material.setPbrMaterial(screen, {
  texture: videoTexture,
  roughness: 1.0,
  specularIntensity: 0,
  metallic: 0,
  emissiveTexture: videoTexture,
  emissiveIntensity: 0.6,
  emissiveColor: Color3.White()
})
```

### Video Events

Monitor video playback state:

```typescript
import { videoEventsSystem, VideoState } from '@dcl/sdk/ecs'

videoEventsSystem.registerVideoEventsEntity(screen, (videoEvent) => {
  switch (videoEvent.state) {
    case VideoState.VS_PLAYING:
      console.log('Video started playing')
      break
    case VideoState.VS_PAUSED:
      console.log('Video paused')
      break
    case VideoState.VS_READY:
      console.log('Video ready to play')
      break
    case VideoState.VS_ERROR:
      console.log('Video error occurred')
      break
  }
})
```

## Spatial Audio

Audio in Decentraland is **spatial by default** — it gets louder as the player approaches the audio source entity and quieter as they move away. The position is determined by the entity's `Transform`.

To make audio non-spatial (same volume everywhere), there's no built-in flag — keep the volume low and place the audio at the scene center.

## Important Notes

- Audio files must be in the project's directory (relative paths from project root)
- Video requires HTTPS URLs — HTTP won't work
- Players must interact with the scene (click) before audio can play (browser autoplay policy)
- Keep audio files small — large files increase scene load time
- Use `.mp3` for music and `.ogg` for sound effects (smaller file sizes)
- Video playback requires the `ALLOW_MEDIA_HOSTNAMES` permission in scene.json for external URLs
- For live video streaming, use HLS (.m3u8) URLs when possible
