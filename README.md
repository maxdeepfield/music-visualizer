# Absolute Visualizer Freakout

Turn an audio file into a loud, glossy, overcaffeinated visualizer music video.

<img width="2431" height="1335" alt="image" src="https://github.com/user-attachments/assets/39ae2b47-ee49-4bf2-b780-eaffa8adbf47" />

Built with `canvas`, `Web Audio API`, and `MediaRecorder`. No backend. No timeline UI. Just upload a track, tweak the look, and let it freak out.

## What It Does

- uploads an audio file and previews it in-browser
- renders animated visualizer templates with bass-reactive motion
- lets you edit the in-video title
- randomizes palettes, including darker neon looks and lighter themes
- supports an optional background photo with cover-style crop
- exports video with audio directly from the browser
- remembers your visual settings between refreshes

## Quick Start

```powershell
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Production Build

```powershell
npm run build
npm run preview
```

## Workflow

1. Load a track.
2. Pick a template.
3. Edit the title, randomize colors, or add a background photo.
4. Hit `Export Video`.

## Good To Know

- export is real-time, so a 3 minute song takes about 3 minutes to render
- export is currently MP4-only and depends on browser `MediaRecorder` support
- the background photo is included in both preview and exported video
- local image selection does not persist after refresh, but the rest of the visual settings do
