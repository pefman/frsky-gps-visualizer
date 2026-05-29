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
  rssi900MdB: number
  rssi24GdB: number
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
  sampleCount: number
  durationMs: number
  frameIntervalMs: number
  averageFrameIntervalMs: number
  frameRateHz: number
  averageSpeedKmh: number
  maxSpeedKmh: number
  maxRollDeg: number
  maxPitchDeg: number
  maxAltitudeM: number
  minAltitudeM: number
  minTxBatteryV: number
  minRxBatteryV: number
  minRssi900MdB: number
  minRssi24GdB: number
}

export interface ParsedFlightLog {
  fileName: string
  frames: TelemetryFrame[]
  mode: PlaybackMode
  summary: FlightSummary
}