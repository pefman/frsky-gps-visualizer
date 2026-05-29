import type { TelemetryFrame } from '../types'

export interface InterpolationSettings {
  position: boolean
  heading: boolean
  speed: boolean
  altitude: boolean
  roll: boolean
  pitch: boolean
  throttle: boolean
  rudder: boolean
  elevator: boolean
  aileron: boolean
}

export const DEFAULT_INTERPOLATION_SETTINGS: InterpolationSettings = {
  position: true,
  heading: true,
  speed: true,
  altitude: true,
  roll: true,
  pitch: true,
  throttle: true,
  rudder: true,
  elevator: true,
  aileron: true,
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}

function lerpAngle(start: number, end: number, amount: number): number {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start))
  return start + delta * amount
}

export function sampleFrameAtTime(
  frames: TelemetryFrame[],
  elapsedMs: number,
  interpolationSettings: InterpolationSettings = DEFAULT_INTERPOLATION_SETTINGS,
): TelemetryFrame | null {
  if (frames.length === 0) {
    return null
  }

  if (elapsedMs <= frames[0].elapsedMs) {
    return frames[0]
  }

  const lastFrame = frames[frames.length - 1]
  if (elapsedMs >= lastFrame.elapsedMs) {
    return lastFrame
  }

  let low = 0
  let high = frames.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (frames[mid].elapsedMs < elapsedMs) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const nextIndex = clamp(low, 1, frames.length - 1)
  const previousFrame = frames[nextIndex - 1]
  const nextFrame = frames[nextIndex]
  const spanMs = Math.max(1, nextFrame.elapsedMs - previousFrame.elapsedMs)
  const amount = clamp((elapsedMs - previousFrame.elapsedMs) / spanMs, 0, 1)

  return {
    ...previousFrame,
    elapsedMs,
    altitudeM: interpolationSettings.altitude
      ? lerp(previousFrame.altitudeM, nextFrame.altitudeM, amount)
      : previousFrame.altitudeM,
    speedKmh: interpolationSettings.speed
      ? lerp(previousFrame.speedKmh, nextFrame.speedKmh, amount)
      : previousFrame.speedKmh,
    rssi900MdB: previousFrame.rssi900MdB,
    rssi24GdB: previousFrame.rssi24GdB,
    rollDeg: interpolationSettings.roll
      ? lerpAngle(previousFrame.rollDeg, nextFrame.rollDeg, amount)
      : previousFrame.rollDeg,
    pitchDeg: interpolationSettings.pitch
      ? lerp(previousFrame.pitchDeg, nextFrame.pitchDeg, amount)
      : previousFrame.pitchDeg,
    throttle: interpolationSettings.throttle
      ? lerp(previousFrame.throttle, nextFrame.throttle, amount)
      : previousFrame.throttle,
    rudder: interpolationSettings.rudder
      ? lerp(previousFrame.rudder, nextFrame.rudder, amount)
      : previousFrame.rudder,
    elevator: interpolationSettings.elevator
      ? lerp(previousFrame.elevator, nextFrame.elevator, amount)
      : previousFrame.elevator,
    aileron: interpolationSettings.aileron
      ? lerp(previousFrame.aileron, nextFrame.aileron, amount)
      : previousFrame.aileron,
    headingRad: interpolationSettings.heading
      ? lerpAngle(previousFrame.headingRad, nextFrame.headingRad, amount)
      : previousFrame.headingRad,
    point: {
      x: interpolationSettings.position ? lerp(previousFrame.point.x, nextFrame.point.x, amount) : previousFrame.point.x,
      y: interpolationSettings.position ? lerp(previousFrame.point.y, nextFrame.point.y, amount) : previousFrame.point.y,
      z: interpolationSettings.position ? lerp(previousFrame.point.z, nextFrame.point.z, amount) : previousFrame.point.z,
    },
  }
}

export function findFrameIndexAtTime(frames: TelemetryFrame[], elapsedMs: number): number {
  if (frames.length === 0) {
    return 0
  }

  let low = 0
  let high = frames.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const current = frames[mid].elapsedMs

    if (current === elapsedMs) {
      return mid
    }

    if (current < elapsedMs) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return clamp(high, 0, frames.length - 1)
}

export function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((elapsedMs % 1000) / 100)

  return `${String(minutes).padStart(2, '0')}:${
      String(seconds).padStart(2, '0')}.${tenths}`
}