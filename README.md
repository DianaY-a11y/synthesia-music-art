# synesthesia

turn an artwork into a 3d field of grains and a calm, generative soundtrack.

- the landing bloom is a blue gaussian-splat poppy, drawn as a flowing grid of characters
- upload an image: it becomes a grain landscape, and a scan line plays it left to right
- brightness and position become notes; dark edges are trimmed and long silences glide by
- two moods: **meditation** (bowls, drone, sub) and **focus** (soft keys, pad, bass, a quiet pulse)
- everything runs in the browser: no ai, no api keys, no network calls

## stack

react 19 + typescript, built with vite. rendering is raw webgl2; sound is synthesised live with web audio.

```
src/
  App.tsx                       app state: landing → creating → listening
  main.tsx                      entry point
  styles.css
  types.ts, constants.ts
  components/
    BloomScene.tsx              landing bloom + floating "section" boxes
    LandscapeScene.tsx          the artwork as grains
    Header.tsx, UploadPrompt.tsx, StatusMessages.tsx, icons.tsx
    ControlPanel/               mood, play, loudness curve, sliders
  hooks/                        useAnimationFrame, useViewportSize
  audio/
    AudioEngine.ts              calm instruments, reverb, mix
    Player.ts                   scans the artwork and triggers notes
    moods.ts                    meditation / focus settings, instrument options
  analysis/
    readArtwork.ts              brightness, colour, texture → tempo, scale, density
    buildScore.ts               trims the artwork and samples it into a playable grid
  scenes/
    bloom/                      splat generation, renderer, shaders
    landscape/                  grain renderer, shaders
    boxes/                      inspection boxes overlay
  lib/                          vector maths, webgl helpers
```

## run locally

```
npm install
npm run dev
```

## deploy

vercel builds with `vite build` and serves `dist/`.
