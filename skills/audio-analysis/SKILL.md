---
name: audio-analysis
description: Read real-time amplitude and 8-band frequency data from any AudioSource, AudioStream, or VideoPlayer entity in a Decentraland SDK7 scene with the AudioAnalysis component. Renderer fills the component each frame; scenes copy values into a plain JS view via readIntoView/tryReadIntoView and drive entity scale, color, lights, materials, particles, or UI from amplitude (overall loudness) and bands[0..7] (low→high frequency bins). Use when the user asks for music visualizers, beat reactivity, audio-reactive scenes, equalizers, dancing lights, scaling cubes that pulse to music, audio-driven materials, or anything that should react to sound. Do NOT use to play sound (see audio-video) or to detect player-emitted audio (this reads only entity-attached AudioSource/AudioStream/VideoPlayer audio).
---

# AudioAnalysis

Real-time audio signal analysis attached to any entity that already has an `AudioSource`, `AudioStream`, or `VideoPlayer`. The renderer analyzes the audio frame buffer and writes results back into the component each tick. Scenes read those results to drive visualizers, beat-reactive geometry, audio-driven lights, etc.

## Authoring split

The **audio-emitting entity** (a speaker / radio / video screen) is static and belongs in `main-entities.ts` with its `AudioSource` / `AudioStream` / `VideoPlayer` component. `AudioAnalysis` itself is **not** in the supported declarative list — attach it at runtime in `src/index.ts` via `getEntityOrNullByName`. Reactive entities (pulsing cubes, EQ bars) are likewise added in code since their visuals are driven dynamically.

```typescript
// main-entities.ts — the audio source
dj_speaker: {
  components: {
    Transform: { position: { x: 8, y: 1, z: 8 } },
    AudioSource: { audioClipUrl: 'sounds/track.mp3', playing: true, loop: true, volume: 0.8 }
  }
}
```

```typescript
// src/index.ts — attach analysis + reactive systems
import { engine, AudioAnalysis, PBAudioAnalysisMode, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

export function main() {
  const speaker = engine.getEntityOrNullByName('dj_speaker')
  if (!speaker) return
  AudioAnalysis.createAudioAnalysis(speaker, PBAudioAnalysisMode.MODE_LOGARITHMIC)
  // ... reactive systems below
}
```

## RULE: Requires an audio-emitting component on the same entity

`AudioAnalysis` does nothing on its own. The entity MUST also have one of: `AudioSource`, `AudioStream`, or `VideoPlayer`. The renderer taps that component's audio frame buffer to compute amplitude/bands. An entity with only `AudioAnalysis` produces no data.

## RULE: Audio must be playing for non-zero output

Values are derived from live audio frames. If the source is paused, muted, or not yet loaded, `amplitude` and all `bands[]` stay at `0`. There is no "ready" event — start your reactive systems unconditionally, they will simply animate toward `0` while silent.

## RULE: Only the Unity explorer implements this

Bevy and the mobile Godot explorer ignore the component (no analysis written). Treat `AudioAnalysis` as a Unity-explorer-only enhancement and design fallbacks (e.g. a base scale that doesn't depend on `amplitude`) so the scene still looks reasonable elsewhere.

## RULE: Read via `readIntoView` into a pre-allocated view

`readIntoView` / `tryReadIntoView` write into a caller-owned `AudioAnalysisView = { amplitude: number, bands: number[] }`. Allocate the view once at scene init and reuse it every frame — do not `new` it inside the system. The `bands` array MUST be pre-sized to 8.

## RULE: Use `createAudioAnalysis`, not `create`

Use the helper `AudioAnalysis.createAudioAnalysis(entity, mode?, amplitudeGain?, bandsGain?)`. It pre-fills all required protobuf fields (8 bands + amplitude + mode) with safe defaults. Calling the raw `AudioAnalysis.create(entity, {...})` requires you to provide every band/amplitude field manually. Use `createOrReplaceAudioAnalysis` to overwrite an existing one without throwing.

## Import

```typescript
import {
  AudioAnalysis,
  AudioAnalysisView,
  PBAudioAnalysisMode,
  AudioSource, // or AudioStream / VideoPlayer
  engine,
  Transform
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
```

`AudioAnalysisView` is a TypeScript type alias (not a component), exported from `@dcl/sdk/ecs`.

## Component fields

Output (filled by the renderer; read in your systems):

| Field | Type | Range | Notes |
|---|---|---|---|
| `amplitude` | `number` | `0..~1` (mode-dep.) | Aggregate signal strength of the current audio frame. |
| `band0` | `number` | `0..~1` (mode-dep.) | Lowest frequency bin (sub-bass). |
| `band1..6` | `number` | `0..~1` (mode-dep.) | Increasing frequency bins, log-spaced under MODE_LOGARITHMIC. |
| `band7` | `number` | `0..~1` (mode-dep.) | Highest frequency bin (treble/air). |

Inputs (configure once at create time):

| Field | Type | Default | Notes |
|---|---|---|---|
| `mode` | `PBAudioAnalysisMode` | `MODE_LOGARITHMIC` | `MODE_RAW = 0` (raw FFT magnitudes) / `MODE_LOGARITHMIC = 1` (perceptual log mapping, recommended). |
| `amplitudeGain` | `number?` | `5.0` | Multiplier applied to `amplitude`. Only used in MODE_LOGARITHMIC. |
| `bandsGain` | `number?` | `0.05` | Multiplier applied to all 8 bands. Only used in MODE_LOGARITHMIC. |

> Values are unbounded floats — gains can push them above `1`. Clamp or scale in your system if the visual you drive needs `0..1`. For typical music at default gains, expect peaks roughly in `0..1` with normal content sitting `0..0.5`.

## AudioAnalysisView

```typescript
type AudioAnalysisView = {
  amplitude: number
  bands: number[]  // length 8 — bands[0] = lowest freq, bands[7] = highest
}
```

## Reading the data

```typescript
const view: AudioAnalysisView = { amplitude: 0, bands: new Array<number>(8) }

engine.addSystem(() => {
  AudioAnalysis.readIntoView(audioEntity, view)
  // Or, defensive variant — returns false if the component is missing:
  // if (!AudioAnalysis.tryReadIntoView(audioEntity, view)) return

  // view.amplitude and view.bands[0..7] are now populated
})
```

## Common patterns

```typescript
// 1. Pulse an entity's scale to overall amplitude
const view: AudioAnalysisView = { amplitude: 0, bands: new Array<number>(8) }
engine.addSystem(() => {
  AudioAnalysis.readIntoView(audioEntity, view)
  const t = Transform.getMutable(pulseEntity)
  const s = 1 + view.amplitude * 10
  t.scale = Vector3.create(s, s, s)
})

// 2. 8-bar equalizer (one entity per band, scale Y by bands[i])
for (const [entity, _] of engine.getEntitiesWith(VisualBar, Transform)) {
  const i = VisualBar.get(entity).index   // 0..7
  Transform.getMutable(entity).scale = Vector3.create(1, view.bands[i] * BAR_HEIGHT, 1)
}

// 3. Bass-only kick
const bass = view.bands[0] + view.bands[1]
if (bass > 0.7) { /* trigger flash */ }

// 4. Custom gains (less sensitive amplitude, punchier bands)
AudioAnalysis.createAudioAnalysis(
  audioEntity,
  PBAudioAnalysisMode.MODE_LOGARITHMIC,
  2.0,
  0.1
)
```

## Mode selection

- `MODE_LOGARITHMIC` (default) — bands are log-spaced and gain-scaled to roughly fit `0..1` for typical music. Use for visualizers, scaling, color reactivity. `amplitudeGain` / `bandsGain` apply.
- `MODE_RAW` — raw FFT-derived magnitudes, linearly spaced. Lower bands dominate visually because most musical energy is there. Gains are ignored. Use only if you intend to do your own normalization.

## Gotchas

- **Output values can exceed `1.0`** with high gains or loud sources. Clamp downstream if you feed UI bars or alpha channels expecting `0..1`.
- **Throttled updates.** Renderer runs analysis under a frame-time budget — values may skip frames under load. Drive smooth animations with `dt` interpolation.
- **Multi-source scenes.** Each audio-emitting entity needs its own `AudioAnalysis`. No global mix-down.
- **Works on `VideoPlayer` audio too.** The same audio frame buffer interface backs `AudioStream` and `VideoPlayer`, so you can react to a video's soundtrack.
- **No `pitch` interaction.** `AudioSource.pitch` changes playback speed; analysis runs on the actual played frames, so a higher pitch shifts perceived band energy upward.
- **Don't call `readIntoView` before `createAudioAnalysis`.** Reading without the component throws. Use `tryReadIntoView` if the component may not be attached yet.

## Permissions

No special scene permission beyond what `AudioSource` / `AudioStream` / `VideoPlayer` already requires. Streamed audio still needs `ALLOW_MEDIA_HOSTNAMES` in `scene.json` for its hostname (see `audio-video` skill).
