---
name: audio-video
description: Add sound effects, music, audio streaming, and video players to Decentraland scenes. Covers AudioSource (local files), AudioStream (streaming URLs), VideoPlayer (video surfaces), video events, and media permissions. Use when the user wants sound, music, audio, video screens, radio, or media playback. Do NOT use for 3D model animations (see animations-tweens).
---

# Audio and Video in Decentraland

## Authoring split

- **`AudioSource`** (local audio files), **`AudioStream`** (streaming URLs), and **`VideoPlayer`** are all supported in `main-entities.ts` — declare the speaker / radio / screen entity fully there with the streaming/playback config.
- Volume / play / pause toggles at runtime happen in `src/index.ts` via `getMutable`.

## When to Use Which Media Component

| Need | Component | Key Difference |
|------|-----------|---------------|
| Sound effect from a file (click, explosion, footstep) | `AudioSource` | Local file, spatial, one-shot or looping |
| Background music or radio stream | `AudioStream` | External URL, non-spatial, continuous |
| Video on a surface (screen, billboard) | `VideoPlayer` + `Material.Texture.Video` | Requires a mesh to display on |

**Decision flow:**
1. Is it a local audio file? → `AudioSource`
2. Is it a streaming URL (radio, live audio)? → `AudioStream`
3. Is it video content? → `VideoPlayer` on a plane/mesh

## Audio Source (Sound Effects & Music)

Declare the speaker in `main-entities.ts`:

```typescript
// main-entities.ts
import type { Scene } from '@dcl/sdk/scene-types'

export const scene = {
  speaker: {
    components: {
      Transform: { position: { x: 8, y: 1, z: 8 } },
      AudioSource: {
        audioClipUrl: 'sounds/music.mp3',
        playing: true,
        loop: true,
        volume: 0.5,   // 0 to 1
        pitch: 1.0     // Playback speed (0.5 = half speed, 2.0 = double)
      }
    }
  }
} satisfies Scene
```

### Supported Formats
- `.mp3` (recommended)
- `.ogg`
- `.wav`

### Spatial vs Non-Spatial Audio

`AudioSource` defaults to spatial (volume falls off with distance). For background music / radio / non-positional sound effects, set `global: true`:

```typescript
// main-entities.ts
bg_music: {
  components: {
    Transform: { position: { x: 0, y: 0, z: 0 } },  // ignored when global
    AudioSource: {
      audioClipUrl: 'sounds/bg.mp3',
      playing: true,
      loop: true,
      volume: 0.5,
      global: true   // heard everywhere in the scene at constant volume
    }
  }
}
```

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

### Play/Stop/Toggle (runtime, in `src/index.ts`)
```typescript
import { engine, AudioSource } from '@dcl/sdk/ecs'

export function main() {
  const speaker = engine.getEntityOrNullByName('speaker')
  if (!speaker) return

  AudioSource.getMutable(speaker).playing = true   // play
  AudioSource.getMutable(speaker).playing = false  // stop

  // toggle
  const audio = AudioSource.getMutable(speaker)
  audio.playing = !audio.playing
}
```

### Play on Click

Static entities (the button mesh and the click-sfx speaker) go in `main-entities.ts`. `PointerEvents` and the click handler are runtime — they live in `src/index.ts`.

```typescript
// main-entities.ts
sfx_button: {
  components: {
    Transform: { position: { x: 8, y: 1, z: 8 } },
    MeshRenderer: { mesh: { $case: 'box', box: { uvs: [] } } }
  }
},
click_sfx: {
  components: {
    Transform: { position: { x: 8, y: 1, z: 8 } },
    AudioSource: {
      audioClipUrl: 'sounds/click.mp3',
      playing: false,
      loop: false,
      volume: 0.8
    }
  }
}
```

```typescript
// src/index.ts
import { engine, AudioSource, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'

export function main() {
  const button = engine.getEntityOrNullByName('sfx_button')
  const sfx = engine.getEntityOrNullByName('click_sfx')
  if (!button || !sfx) return

  pointerEventsSystem.onPointerDown(
    { entity: button, opts: { button: InputAction.IA_POINTER, hoverText: 'Play sound' } },
    () => {
      // Reset and play
      const audio = AudioSource.getMutable(sfx)
      audio.playing = false
      audio.playing = true
    }
  )
}
```

## Audio Streaming

`AudioStream` is supported in `main-entities.ts` — declare the radio entity with its streaming config in one place:

```typescript
// main-entities.ts
radio: {
  components: {
    Transform: { position: { x: 8, y: 1, z: 8 } },
    GltfContainer: { src: 'models/radio.glb' },
    AudioStream: {
      url: 'https://example.com/stream.mp3',
      playing: true,
      volume: 0.3
    }
  }
}
```

Toggling play / volume at runtime is the same `getMutable` pattern as `AudioSource`.

## Video Player

`VideoPlayer`, `MeshRenderer`, and the screen Transform all go in `main-entities.ts`. The video **texture binding** in `Material` needs a runtime Entity ID, not a name — the build only resolves `Transform.parent` by name. So `Material` is set at runtime in `src/index.ts`:

```typescript
// main-entities.ts
video_screen: {
  components: {
    Transform: {
      position: { x: 8, y: 3, z: 15.9 },
      scale: { x: 8, y: 4.5, z: 1 }    // 16:9 ratio
    },
    MeshRenderer: { mesh: { $case: 'plane', plane: { uvs: [] } } },
    VideoPlayer: {
      src: 'https://example.com/video.mp4',
      playing: true,
      loop: true,
      volume: 0.5,
      playbackRate: 1.0,
      position: 0   // start time in seconds
    }
  }
}
```

```typescript
// src/index.ts
import { engine, Material } from '@dcl/sdk/ecs'

export function main() {
  const screen = engine.getEntityOrNullByName('video_screen')
  if (!screen) return

  const videoTexture = Material.Texture.Video({ videoPlayerEntity: screen })
  // Basic material — better performance than PBR for video surfaces
  Material.setBasicMaterial(screen, { texture: videoTexture })
}
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

### Video on a GLTF Surface (Curved Screens, TVs, Monitors)

When the "screen" is part of a model (a TV in a living room scene, a curved arena display), keep the GLTF and override its screen material with the video texture via `GltfNodeModifiers` at runtime:

```typescript
// main-entities.ts — declare the TV model
tv: {
  components: {
    Transform: { position: { x: 8, y: 1.5, z: 8 } },
    GltfContainer: { src: 'models/tv.glb' },
    VideoPlayer: { src: 'https://example.com/show.mp4', playing: true, loop: true }
  }
}
```

```typescript
// src/index.ts — bind the video texture to the screen sub-mesh by path
import { engine, Material, GltfNodeModifiers } from '@dcl/sdk/ecs'

export function main() {
  const tv = engine.getEntityOrNullByName('tv')
  if (!tv) return

  const videoTexture = Material.Texture.Video({ videoPlayerEntity: tv })
  GltfNodeModifiers.createOrReplace(tv, {
    modifiers: [
      {
        path: 'TV/Screen',  // GLTF node path to the screen sub-mesh
        material: {
          material: {
            $case: 'unlit',
            unlit: { texture: videoTexture }
          }
        }
      }
    ]
  })
}
```

Use `path: ''` (empty) to apply the video material to every node of the model — useful when the whole model is the screen (e.g., a flat billboard mesh exported from Blender).

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

## Free Audio Files

Always check the audio catalog before creating placeholder sound file references. It contains 50 free sounds from the Creator Hub asset packs.

Read `{baseDir}/../../context/audio-catalog.md` for music tracks (ambient, dance, medieval, sci-fi, etc.), ambient sounds (birds, city, factory, etc.), interaction sounds (buttons, doors, levers, chests), sound effects (explosions, sirens, bells), and game mechanic sounds (win/lose, heal, respawn, damage).

To use a catalog sound:
```bash
# Download from catalog
mkdir -p sounds
curl -o sounds/ambient_1.mp3 "https://builder-items.decentraland.org/contents/bafybeic4faewxkdqx67dloyw57ikgaeibc2e2dbx34hwjubl3gfvs2r4su"
```
```typescript
// Reference in code — must be a local file path
AudioSource.create(entity, { audioClipUrl: 'sounds/ambient_1.mp3', playing: true, loop: true })
```

### How to suggest audio

1. Read the audio catalog file
2. Search for sounds matching the user's description/theme
3. Suggest specific sounds with download commands
4. Download selected sounds into the scene's `sounds/` directory
5. Reference them in code with local paths

> **Important**: `AudioSource` only works with **local files**. Never use external URLs for the `audioClipUrl` field. Always download audio into `sounds/` first.

### Video State Polling

Check video playback state programmatically:

```typescript
import { videoEventsSystem, VideoState } from '@dcl/sdk/ecs'

engine.addSystem(() => {
  const state = videoEventsSystem.getVideoState(videoEntity)
  if (state) {
    console.log('Video state:', state.state) // VideoState.VS_PLAYING, VS_PAUSED, etc.
    console.log('Current time:', state.currentOffset)
  }
})
```

### Audio Playback Events

Use the `AudioEvent` component to detect audio state changes:

```typescript
import { AudioEvent } from '@dcl/sdk/ecs'

engine.addSystem(() => {
  const event = AudioEvent.getOrNull(audioEntity)
  if (event) {
    console.log('Audio state:', event.state) // playing, paused, finished
  }
})
```

### Permission for External Media

External audio/video URLs require the `ALLOW_MEDIA_HOSTNAMES` permission in scene.json:

```json
{
  "requiredPermissions": ["ALLOW_MEDIA_HOSTNAMES"],
  "allowedMediaHostnames": ["stream.example.com", "cdn.example.com"]
}
```

### Multiple Video Surfaces

Share one VideoPlayer across multiple screens by referencing the same `videoPlayerEntity`:

```typescript
Material.setPbrMaterial(screen1, {
  texture: Material.Texture.Video({ videoPlayerEntity: videoEntity })
})
Material.setPbrMaterial(screen2, {
  texture: Material.Texture.Video({ videoPlayerEntity: videoEntity })
})
```

### Video Limits & Tips

- **Simultaneous videos**: 1 in preview, 5 in Explorer, 10 max across the scene
- **Distance-based control**: Pause video when player is far away to save bandwidth
- **Supported formats**: `.mp4` (H.264), `.webm`, HLS (`.m3u8`) for live streaming
- **Live streaming**: Use HLS (`.m3u8`) URLs — most reliable across clients

For full component field details, supported formats, and advanced patterns, see `{baseDir}/references/media-reference.md`.

## Important Notes

- Audio files must be in the project's directory (relative paths from project root)
- Video requires HTTPS URLs — HTTP won't work
- Players must interact with the scene (click) before audio can play (browser autoplay policy)
- Keep audio files small — large files increase scene load time
- Use `.mp3` for music and `.ogg` for sound effects (smaller file sizes)
- For live video streaming, use HLS (.m3u8) URLs when possible
