export type CameraPreset = 'chase'|'orbit'|'top'|'cockpit'

export type PlaybackMode = 'estimated'|'gps'

export interface FlightPoint {
  x: number
  y: number
  z: number
}

export interface TelemetryFrame {
  index: number
  timestampMs: number
  elapsedMs: number
  speedKmh: number
  altitudeM: number
  rollDeg: number
  pitchDeg: number
  throttle: number
  rudder: number
  elevator: number
  aileron: number
  point: FlightPoint
  headingRad: number
  gps: {latitude: number|null
    longitude: number | null
  }
}

export interface FlightSummary {
  durationMs: number
  frameIntervalMs: number
  frameRateHz: number
  maxSpeedKmh: number
  maxAltitudeM: number
  minAltitudeM: number
}

export interface ParsedFlightLog {
  fileName: string
  frames: TelemetryFrame[]
  mode: PlaybackMode
  summary: FlightSummary
}