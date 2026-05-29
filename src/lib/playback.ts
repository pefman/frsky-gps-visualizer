import type { TelemetryFrame } from '../types'

export const MIN_INTERPOLATION_FPS = 0
export const MAX_INTERPOLATION_FPS = 60

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
    altitudeM: lerp(previousFrame.altitudeM, nextFrame.altitudeM, amount),
    speedKmh: lerp(previousFrame.speedKmh, nextFrame.speedKmh, amount),
    rssi900MdB: previousFrame.rssi900MdB,
    rssi24GdB: previousFrame.rssi24GdB,
    rollDeg: lerpAngle(previousFrame.rollDeg, nextFrame.rollDeg, amount),
    pitchDeg: lerp(previousFrame.pitchDeg, nextFrame.pitchDeg, amount),
    throttle: lerp(previousFrame.throttle, nextFrame.throttle, amount),
    rudder: lerp(previousFrame.rudder, nextFrame.rudder, amount),
    elevator: lerp(previousFrame.elevator, nextFrame.elevator, amount),
    aileron: lerp(previousFrame.aileron, nextFrame.aileron, amount),
    headingRad: lerpAngle(previousFrame.headingRad, nextFrame.headingRad, amount),
    point: {
      x: lerp(previousFrame.point.x, nextFrame.point.x, amount),
      y: lerp(previousFrame.point.y, nextFrame.point.y, amount),
      z: lerp(previousFrame.point.z, nextFrame.point.z, amount),
    },
  }
}

export function buildInterpolatedPlaybackFrames(
  frames: TelemetryFrame[],
  targetFps: number,
): TelemetryFrame[] {
  if (frames.length === 0) {
    return []
  }

  const normalizedFps = clamp(Math.round(targetFps), MIN_INTERPOLATION_FPS, MAX_INTERPOLATION_FPS)
  if (normalizedFps === 0 || frames.length === 1) {
    return frames
  }

  const stepMs = 1000 / normalizedFps
  const lastElapsedMs = frames[frames.length - 1].elapsedMs
  const playbackFrames: TelemetryFrame[] = []

  for (let sampleIndex = 0, elapsedMs = 0; elapsedMs < lastElapsedMs; sampleIndex += 1, elapsedMs = sampleIndex * stepMs) {
    const sampledFrame = sampleFrameAtTime(frames, elapsedMs)
    if (!sampledFrame) {
      continue
    }

    playbackFrames.push({
      ...sampledFrame,
      index: sampleIndex,
      elapsedMs,
    })
  }

  const finalSample = sampleFrameAtTime(frames, lastElapsedMs)
  if (finalSample) {
    const previous = playbackFrames[playbackFrames.length - 1]
    if (!previous || Math.abs(previous.elapsedMs - lastElapsedMs) > 0.001) {
      playbackFrames.push({
        ...finalSample,
        index: playbackFrames.length,
        elapsedMs: lastElapsedMs,
      })
    }
  }

  return playbackFrames
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