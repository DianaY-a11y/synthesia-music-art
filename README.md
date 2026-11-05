# synesthesia

turn an artwork into a 3d field of grains and a calm, generative soundtrack.

- upload an image: the landing bloom (a blue gaussian-splat poppy, drawn as a character grid) "creates" the piece
- the image becomes a grain landscape; a scan line plays it left to right
- brightness and position become notes; long dark stretches are trimmed or glided through
- two moods: **meditation** (bowls, drone, sub, no percussion) and **focus** (soft keys, warm pad, bass, a quiet pulse)
- everything runs in the browser: no ai, no api keys, no network calls

the whole app is the single `index.html` (vanilla javascript, webgl2 shaders, web audio).

## run locally

```
npm install
npm run dev
```

## deploy

vercel builds it with `vite build` and serves `dist/`.
