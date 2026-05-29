import type { ParsedFlightLog, TelemetryFrame } from '../types'

export interface TimelineHighlight {
  id: string
  label: string
  startMs: number
  endMs: number
  tone: 'info' | 'success' | 'warning' | 'secondary'
}

export interface TimelineMarker {
  id: string
  label: string
  atMs: number
  tone: 'info' | 'success' | 'warning' | 'secondary'
}

interface SegmentCandidate {
  startMs: number
  endMs: number
}

function collectSegments(
  frames: TelemetryFrame[],
  predicate: (frame: TelemetryFrame) => boolean,
  minDurationMs: number,
): SegmentCandidate[] {
  const segments: SegmentCandidate[] = []
  let startIndex = -1

  for (let index = 0; index < frames.length; index += 1) {
    const matches = predicate(frames[index])

    if (matches && startIndex === -1) {
      startIndex = index
      continue
    }

    if (!matches && startIndex !== -1) {
      const startMs = frames[startIndex].elapsedMs
      const endMs = frames[index - 1].elapsedMs
      if (endMs - startMs >= minDurationMs) {
        segments.push({ startMs, endMs })
      }
      startIndex = -1
    }
  }

  if (startIndex !== -1) {
    const startMs = frames[startIndex].elapsedMs
    const endMs = frames[frames.length - 1].elapsedMs
    if (endMs - startMs >= minDurationMs) {
      segments.push({ startMs, endMs })
    }
  }

  return segments
}

function pickLongest(segments: SegmentCandidate[], count: number): SegmentCandidate[] {
  return [...segments]
    .sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs))
    .slice(0, count)
    .sort((a, b) => a.startMs - b.startMs)
}

export function buildTimelineHighlights(flightLog: ParsedFlightLog | null): TimelineHighlight[] {
  if (!flightLog || flightLog.frames.length < 2) {
    return []
  }

  const frames = flightLog.frames
  const durationMs = Math.max(flightLog.summary.durationMs, 1)
  const minimumAltitude = flightLog.summary.minAltitudeM
  const averageSpeed = flightLog.summary.averageSpeedKmh
  const maxSpeed = flightLog.summary.maxSpeedKmh

  const highlights: TimelineHighlight[] = []

  const startEndMs = Math.min(durationMs * 0.16, 4000)
  if (startEndMs > 400) {
    highlights.push({
      id: 'start',
      label: 'Takeoff / Start',
      startMs: 0,
      endMs: startEndMs,
      tone: 'info',
    })
  }

  const highSpeedThreshold = Math.max(averageSpeed * 1.25, maxSpeed * 0.82)
  const highSpeedSegments = collectSegments(
    frames,
    (frame) => frame.speedKmh >= highSpeedThreshold,
    1200,
  )

  pickLongest(highSpeedSegments, 2).forEach((segment, index) => {
    highlights.push({
      id: `high-speed-${index}`,
      label: 'High speed',
      startMs: segment.startMs,
      endMs: segment.endMs,
      tone: 'warning',
    })
  })

  const aerobaticSegments = collectSegments(
    frames,
    (frame) => Math.abs(frame.pitchDeg) >= 45 && frame.speedKmh >= averageSpeed * 0.65,
    900,
  )

  pickLongest(aerobaticSegments, 2).forEach((segment, index) => {
    highlights.push({
      id: `aero-${index}`,
      label: 'Loop / Vertical',
      startMs: segment.startMs,
      endMs: segment.endMs,
      tone: 'secondary',
    })
  })

  const lowFastSegments = collectSegments(
    frames,
    (frame) => frame.speedKmh >= highSpeedThreshold * 0.92 && frame.altitudeM <= minimumAltitude + 8,
    1200,
  )

  pickLongest(lowFastSegments, 1).forEach((segment, index) => {
    highlights.push({
      id: `low-fast-${index}`,
      label: 'Low fast pass',
      startMs: segment.startMs,
      endMs: segment.endMs,
      tone: 'warning',
    })
  })

  const landingSegments = collectSegments(
    frames,
    (frame) => frame.altitudeM <= minimumAltitude + 2.2 && frame.speedKmh <= 25,
    1500,
  )

  const nearEndLanding = [...landingSegments]
    .filter((segment) => segment.endMs >= durationMs * 0.72)
    .sort((a, b) => b.endMs - a.endMs)[0]

  if (nearEndLanding) {
    highlights.push({
      id: 'landing',
      label: 'Landing',
      startMs: nearEndLanding.startMs,
      endMs: nearEndLanding.endMs,
      tone: 'success',
    })
  }

  return highlights
    .map((item) => ({
      ...item,
      startMs: Math.max(0, Math.min(item.startMs, durationMs)),
      endMs: Math.max(0, Math.min(item.endMs, durationMs)),
    }))
    .filter((item) => item.endMs > item.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 7)
}

function pushMarkerIfFarEnough(markers: TimelineMarker[], candidate: TimelineMarker, minimumGapMs: number): void {
  const isTooClose = markers.some((existing) => Math.abs(existing.atMs - candidate.atMs) < minimumGapMs)
  if (!isTooClose) {
    markers.push(candidate)
  }
}

function findPeakFrame(
  frames: TelemetryFrame[],
  score: (frame: TelemetryFrame) => number,
): TelemetryFrame {
  return frames.reduce((best, frame) => (score(frame) > score(best) ? frame : best), frames[0])
}

export function buildTimelineMarkers(
  flightLog: ParsedFlightLog | null,
  highlights: TimelineHighlight[],
): TimelineMarker[] {
  if (!flightLog || flightLog.frames.length < 2) {
    return []
  }

  const frames = flightLog.frames
  const durationMs = Math.max(flightLog.summary.durationMs, 1)
  const minAltitude = flightLog.summary.minAltitudeM
  const averageSpeed = flightLog.summary.averageSpeedKmh
  const maxSpeed = flightLog.summary.maxSpeedKmh
  const minimumGapMs = Math.max(700, durationMs * 0.025)

  const markers: TimelineMarker[] = []

  const takeoffFrame = frames.find((frame) => frame.speedKmh > 24 && frame.altitudeM > minAltitude + 1.4)
  if (takeoffFrame) {
    markers.push({
      id: 'marker-takeoff',
      label: 'Takeoff',
      atMs: takeoffFrame.elapsedMs,
      tone: 'info',
    })
  }

  const peakSpeedFrame = findPeakFrame(frames, (frame) => frame.speedKmh)
  pushMarkerIfFarEnough(markers, {
    id: 'marker-max-speed',
    label: `Max speed ${peakSpeedFrame.speedKmh.toFixed(0)} km/h`,
    atMs: peakSpeedFrame.elapsedMs,
    tone: 'warning',
  }, minimumGapMs)

  const peakAltitudeFrame = findPeakFrame(frames, (frame) => frame.altitudeM)
  pushMarkerIfFarEnough(markers, {
    id: 'marker-max-altitude',
    label: `Top altitude ${peakAltitudeFrame.altitudeM.toFixed(0)} m`,
    atMs: peakAltitudeFrame.elapsedMs,
    tone: 'info',
  }, minimumGapMs)

  const maxRollFrame = findPeakFrame(frames, (frame) => Math.abs(frame.rollDeg))
  if (Math.abs(maxRollFrame.rollDeg) >= 75) {
    pushMarkerIfFarEnough(markers, {
      id: 'marker-max-roll',
      label: `Max roll ${Math.abs(maxRollFrame.rollDeg).toFixed(0)} deg`,
      atMs: maxRollFrame.elapsedMs,
      tone: 'secondary',
    }, minimumGapMs)
  }

  const maxPitchFrame = findPeakFrame(frames, (frame) => Math.abs(frame.pitchDeg))
  if (Math.abs(maxPitchFrame.pitchDeg) >= 45) {
    pushMarkerIfFarEnough(markers, {
      id: 'marker-max-pitch',
      label: `Max pitch ${Math.abs(maxPitchFrame.pitchDeg).toFixed(0)} deg`,
      atMs: maxPitchFrame.elapsedMs,
      tone: 'secondary',
    }, minimumGapMs)
  }

  const touchdownFrame = [...frames]
    .reverse()
    .find((frame) => frame.elapsedMs > durationMs * 0.65 && frame.altitudeM <= minAltitude + 1.2 && frame.speedKmh <= 20)

  if (touchdownFrame) {
    pushMarkerIfFarEnough(markers, {
      id: 'marker-touchdown',
      label: 'Touchdown',
      atMs: touchdownFrame.elapsedMs,
      tone: 'success',
    }, minimumGapMs)
  }

  highlights
    .filter((highlight) => highlight.label.includes('Loop'))
    .forEach((highlight, index) => {
      const segmentFrames = frames.filter(
        (frame) => frame.elapsedMs >= highlight.startMs && frame.elapsedMs <= highlight.endMs,
      )

      if (segmentFrames.length === 0) {
        return
      }

      const apexFrame = findPeakFrame(segmentFrames, (frame) => frame.altitudeM + Math.abs(frame.pitchDeg) * 0.25)
      pushMarkerIfFarEnough(markers, {
        id: `marker-loop-apex-${index}`,
        label: 'Loop apex',
        atMs: apexFrame.elapsedMs,
        tone: 'secondary',
      }, minimumGapMs)
    })

  const highSpeedEntry = frames.find((frame) => frame.speedKmh >= Math.max(averageSpeed * 1.2, maxSpeed * 0.8))
  if (highSpeedEntry) {
    pushMarkerIfFarEnough(markers, {
      id: 'marker-fast-entry',
      label: 'Fast run start',
      atMs: highSpeedEntry.elapsedMs,
      tone: 'warning',
    }, minimumGapMs)
  }

  return markers
    .map((marker) => ({
      ...marker,
      atMs: Math.max(0, Math.min(marker.atMs, durationMs)),
    }))
    .sort((a, b) => a.atMs - b.atMs)
    .slice(0, 10)
}
