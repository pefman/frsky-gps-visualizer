# FrSky GPS Flight Visualizer

Web app for replaying FrSky telemetry logs in a 3D pilot view.

## Features

- Upload FrSky CSV logs and parse telemetry (speed, altitude, attitude, controls, GPS, RSSI).
- 3D pilot-view playback with an Extra 300S-inspired aircraft model.
- Motion smoothing slider that smooths the rendered aircraft motion between sampled frames.
- Per-channel interpolation controls for playback sampling, including exact-vs-interpolated telemetry channels.
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

- load `src/assets/demo-full-flight.csv`
- set smoothing to 100%
- jump playhead to start
- auto-play immediately

## Smoothing And Interpolation

The app uses two separate layers of smoothing:

- Playback interpolation happens when a frame is sampled from the CSV. You can toggle individual channels in the `Interpolated channels` panel. When a channel is enabled, it is blended between surrounding frames; when it is disabled, it stays exact from the source frame.
- Motion smoothing happens after sampling, inside the 3D scene. It smooths the aircraft’s rendered position, heading, pitch, and roll so the plane moves more fluidly even when frame intervals are uneven.

In short: interpolation decides what values are sampled from the log, and motion smoothing decides how those sampled values are drawn in the viewport.

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
- Heading, roll, speed, altitude, position, and stick channels can be interpolated independently.

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
