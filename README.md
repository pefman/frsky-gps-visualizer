# FrSky GPS Flight Visualizer

Web app for replaying FrSky telemetry logs in a 3D pilot view.

## Features

- Upload FrSky CSV logs and parse telemetry (speed, altitude, attitude, controls, GPS).
- 3D aircraft playback with pilot camera framing.
- Motion smoothing slider (0% to 100%).
- Optional flight trail line.
- Demo mode loads a real extracted segment and starts playback automatically.
- Ground plane is green and altitude is calibrated so y=0 is the lowest CSV altitude.

## Demo Behavior

Click `Load demo` to:

- load `src/assets/demo-segment.csv`
- set smoothing to 100%
- jump playhead to start
- auto-play immediately

## Run Locally

Requirements:

- Node.js 20+
- npm

Install and run:

```bash
npm install
npm run dev
```

Build production bundle:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## CSV Notes

- GPS mode is used when latitude/longitude columns are available.
- If GPS is missing, estimated path mode is used from speed and control inputs.
- Vertical calibration uses the minimum altitude in the loaded file as ground level.

## Deploy (Vibekoded)

This repository includes:

- `Dockerfile` (multi-stage Node build + Nginx runtime)
- `nginx.conf` (SPA fallback)
- `.dockerignore`

Deploy command:

```bash
vk app ship frsky-gps-visualizer
```

Current app URL:

- https://frsky-gps-visualizer-1b2ad1ce.vibekoded.app
