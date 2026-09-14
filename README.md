# Dynamic Flip

Turn wide video into tall video. Steer the crop by hand while the video plays, like holding a phone camera. Everything runs in your browser: nothing is uploaded, no account, no watermark.

## Why

Auto-reframe tools guess where the subject is and often guess wrong. Pro editors let you keyframe the crop by hand, but that is slow. Dynamic Flip records your hand movement as the crop path, then renders it with hardware-accelerated WebCodecs.

## Features

- Drop in MP4, MOV, or WebM. Play, pause, seek, speed 0.5x to 2x, volume.
- Crop box locked to 9:16, 9:18, 4:5, 1:1, 3:4, or 4:3. Full player height by default. Movable and resizable, always inside the frame.
- Live preview of the cropped region in a fixed-size panel, updated every animation frame.
- **Record path**: press record, drag the box while the video plays. Every frame stores time, crop rectangle, volume, and playback rate. Re-recording over a span replaces it. Dragging while paused edits the keyframe under the playhead.
- Download the path as JSON, import it back.
- **Replay session** tab plays the recorded JSON back: crop, volume, and speed follow it.
- **In / out points** (I and O keys) so you export just the segment you want from a long recording.
- **Export MP4** in the browser via WebCodecs and [Mediabunny](https://mediabunny.dev). H.264 video, AAC audio, crop interpolated per frame.

JSON format:

```json
[
  { "timeStamp": 0,    "coordinates": [438, 0, 405, 720], "volume": 1, "playbackRate": 1 },
  { "timeStamp": 1.5,  "coordinates": [320, 0, 405, 720], "volume": 1, "playbackRate": 1 }
]
```

`coordinates` is `[x, y, width, height]` in source-video pixels.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Play / pause |
| R | Start / stop recording |
| ← → | Step one frame (Shift: one second) |
| I / O | Set export in / out point at playhead |
| 1 … 6 | Aspect ratio |
| ? | Shortcuts |

## Browser support

Preview, recording, and JSON work anywhere. Export needs WebCodecs with H.264: Chrome 94+, Edge 94+, Firefox 130+ (desktop), Safari 26+.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run test:e2e   # headless Chrome smoke test; needs dev server running, Google Chrome, and ffmpeg
```

Static site. Deploys to Vercel, Netlify, or GitHub Pages with no server.

## Limits

- Export copies audio unchanged. Volume and playback-rate changes apply to preview and replay only.
- Export speed depends on your hardware. Measured on an M-series MacBook: a 65-minute 1080p recording exports at roughly 13x realtime, so about 5 minutes for the whole file. Use in/out points for clips.
- Very large files are streamed, but decode still happens on your machine, so mobile devices may struggle above a few hundred MB.

## Structure

```
index.html        app shell
src/main.ts       wiring, recording loop, timeline, export UI
src/cropbox.ts    aspect-locked movable/resizable crop rectangle
src/path.ts       keyframe list with interpolation and JSON in/out
src/preview.ts    cropped-region preview canvas
src/exporter.ts   Mediabunny conversion with per-frame crop
tests/e2e.mjs     Playwright smoke test
```
