# FrSky GPS Flight Visualizer

Web app for replaying FrSky telemetry logs in a 3D pilot view.

## Features

- Upload FrSky CSV logs and parse telemetry (speed, altitude, attitude, controls, GPS, RSSI).
- 3D pilot-view playback with an Extra 300S-inspired aircraft model.
- Motion smoothing slider (movement/attitude smoothing only).
- Optional flight trail line.
- Timeline under the viewport with:
	- auto-detected highlight segments
	- auto-created event markers
	- click-to-jump and auto-play from highlights/markers
- Live telemetry cards including exact per-frame RSSI values.
- Live stick movement widgets (Rudder/Throttle and Aileron/Elevator).
- Demo mode loads a real extracted segment and starts playback automatically.
- Ground + pilot baseline calibration from the loaded flight start.
- Tailwind + DaisyUI based UI with compact layout for high-res screens.

## Demo Behavior

Click `Load demo` to:

- load `src/assets/demo-segment.csv`
- set smoothing to 100%
- jump playhead to start
- auto-play immediately

## Timeline And Markers

- Timeline is displayed below the 3D viewport.
- A single time slider is used for seeking.
- Highlight blocks and marker chips are generated automatically from telemetry.
- Clicking a highlight/marker jumps to that time and starts playback.

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

## Tech Stack

- React + TypeScript + Vite
- Three.js for 3D scene rendering
- PapaParse for CSV parsing
- TailwindCSS + DaisyUI for UI

## CSV Notes

- GPS mode is used when latitude/longitude columns are available.
- If GPS is missing, estimated path mode is used from speed and control inputs.
- If GPS mode is active, rows without GPS coordinates are skipped during load.
- Ground/pilot baseline is calibrated from the loaded flight start frame.
- RSSI live readouts use exact frame values (not interpolated).

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
