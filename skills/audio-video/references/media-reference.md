# Media Components Reference

## AudioSource — Full Fields

```typescript
import { AudioSource } from '@dcl/sdk/ecs'

AudioSource.create(entity, {
  audioClipUrl: 'sounds/effect.mp3',  // Path to local audio file (required)
  playing: false,                      // Start/stop playback
  loop: false,                         // Loop when finished
  volume: 1.0,                         // Volume 0.0 to 1.0
  pitch: 1.0                           // Playback speed (0.5 = half, 2.0 = double)
})
```

**Supported formats:** `.mp3` (recommended), `.ogg`, `.wav`

Audio is spatial by default — volume decreases with distance from the entity. Place the entity where the sound should originate.

### Playback Control

```typescript
const audio = AudioSource.getMutable(entity)
audio.playing = true   // Play
audio.playing = false  // Stop
audio.volume = 0.5     // Adjust volume
audio.pitch = 1.5      // Speed up
```

### Reset and Replay

To replay a sound effect from the beginning:
```typescript
const audio = AudioSource.getMutable(entity)
audio.playing = false
audio.playing = true  // Restarts from beginning
```

## AudioStream — Full Fields

```typescript
import { AudioStream } from '@dcl/sdk/ecs'

AudioStream.create(entity, {
  url: 'https://stream.example.com/radio.mp3',  // Streaming URL (required)
  playing: true,                                   // Start/stop stream
  volume: 0.5                                      // Volume 0.0 to 1.0
})
```

**Supported stream formats:** HTTP/HTTPS audio streams (`.mp3`, `.ogg`, `.aac`)

AudioStream is NOT spatial — it plays at the same volume regardless of player distance. Best for background music or radio.

## VideoPlayer — Full Fields

```typescript
import { VideoPlayer } from '@dcl/sdk/ecs'

VideoPlayer.create(entity, {
  src: 'videos/clip.mp4',    // Local file or external URL (required)
  playing: true,              // Start/stop playback
  loop: false,                // Loop when finished
  volume: 1.0,                // Volume 0.0 to 1.0
  playbackRate: 1.0,          // Playback speed
  position: 0                 // Start time in seconds
})
```

**Supported formats:**
- `.mp4` (H.264) — most compatible
- `.webm` — good quality, smaller files
- `.ogg` — open format
- `.m3u8` (HLS) — live streaming, most reliable for streams

### Video Texture Setup

VideoPlayer alone doesn't display video. You must create a video texture and apply it to a mesh:

```typescript
// 1. Create mesh surface
MeshRenderer.setPlane(entity)

// 2. Create video texture referencing the VideoPlayer entity
const videoTexture = Material.Texture.Video({ videoPlayerEntity: entity })

// 3. Apply as basic material (best performance)
Material.setBasicMaterial(entity, { texture: videoTexture })

// OR as PBR material with emissive (self-lit screen)
Material.setPbrMaterial(entity, {
  texture: videoTexture,
  roughness: 1.0,
  specularIntensity: 0,
  metallic: 0,
  emissiveTexture: videoTexture,
  emissiveIntensity: 0.6,
  emissiveColor: Color3.White()
})
```

### Live Streaming

```typescript
// HLS stream
VideoPlayer.create(entity, {
  src: 'https://example.com/stream.m3u8',
  playing: true
})

// LiveKit video stream
VideoPlayer.create(entity, {
  src: 'livekit-video://current-stream',
  playing: true
})
```

### Video Events

```typescript
import { videoEventsSystem, VideoState } from '@dcl/sdk/ecs'

videoEventsSystem.registerVideoEventsEntity(entity, (event) => {
  console.log('State:', event.state)          // VideoState enum
  console.log('Time:', event.currentOffset)   // Current playback time
  console.log('Length:', event.videoLength)    // Total duration
})

// Poll current state
const state = videoEventsSystem.getVideoState(entity)
```

**VideoState values:** `VS_READY`, `VS_PLAYING`, `VS_PAUSED`, `VS_ERROR`, `VS_BUFFERING`, `VS_SEEKING`, `VS_NONE`

### Multiple Screens, One Video

```typescript
// One VideoPlayer, shared across screens
VideoPlayer.create(screen1, { src: 'videos/shared.mp4', playing: true })
const tex = Material.Texture.Video({ videoPlayerEntity: screen1 })
Material.setBasicMaterial(screen1, { texture: tex })
Material.setBasicMaterial(screen2, { texture: tex })
```

### Video Limits

| Quality Setting | Max Simultaneous Videos |
|----------------|------------------------|
| Low | 1 |
| Medium | 5 |
| High | 10 |

### Media Permissions in scene.json

External audio/video URLs require permissions:

```json
{
  "requiredPermissions": ["ALLOW_MEDIA_HOSTNAMES"],
  "allowedMediaHostnames": ["stream.example.com", "cdn.example.com"]
}
```

## AudioAnalysis (Advanced)

Real-time frequency and amplitude data from audio sources:

```typescript
import { AudioAnalysis, AudioAnalysisView } from '@dcl/sdk/ecs'

// Enable analysis on an audio source entity
AudioAnalysis.create(audioEntity, {})

// Read analysis data in a system
engine.addSystem(() => {
  const view = AudioAnalysisView.getOrNull(audioEntity)
  if (view) {
    // Use frequency/amplitude data for visualizers, beat detection, etc.
  }
})
```

Used for music visualizers, reactive environments, and beat-synced animations.
