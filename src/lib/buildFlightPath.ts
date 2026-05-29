import type {ParsedFlightLog, TelemetryFrame} from '../types'

const EARTH_RADIUS_M = 6_371_000;

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeControl(value: number): number {
  return Math.max(-1, Math.min(1, value / 1024));
}

function withAltitudeOffset(
    frame: TelemetryFrame, baselineAltitudeM: number): number {
  return frame.altitudeM - baselineAltitudeM;
}

function buildGpsFrames(frames: TelemetryFrame[]): TelemetryFrame[] {
  const firstGpsFrame = frames.find(
      (frame) => frame.gps.latitude !== null && frame.gps.longitude !== null,
  );

  if (!firstGpsFrame || firstGpsFrame.gps.latitude === null ||
      firstGpsFrame.gps.longitude === null) {
    return frames;
  }

  const baselineAltitudeM = frames[0]?.altitudeM ?? 0;
  const originLatitudeRad = degreesToRadians(firstGpsFrame.gps.latitude);
  const originLongitudeRad = degreesToRadians(firstGpsFrame.gps.longitude);
  let previousHeading = 0;
  let previousPoint = {
    x: 0,
    y: withAltitudeOffset(firstGpsFrame, baselineAltitudeM),
    z: 0,
  };

  return frames.map((frame) => {
    if (frame.gps.latitude === null || frame.gps.longitude === null) {
      return {
        ...frame,
        point: {
          ...previousPoint,
          y: withAltitudeOffset(frame, baselineAltitudeM),
        },
        headingRad: previousHeading,
      };
    }

    const latitudeRad = degreesToRadians(frame.gps.latitude);
    const longitudeRad = degreesToRadians(frame.gps.longitude);
    const deltaLatitude = latitudeRad - originLatitudeRad;
    const deltaLongitude = longitudeRad - originLongitudeRad;
    const x = deltaLongitude * Math.cos(originLatitudeRad) * EARTH_RADIUS_M;
    const z = deltaLatitude * EARTH_RADIUS_M;
    const point = {
      x,
      y: withAltitudeOffset(frame, baselineAltitudeM),
      z,
    };
    const deltaX = point.x - previousPoint.x;
    const deltaZ = point.z - previousPoint.z;

    if (Math.hypot(deltaX, deltaZ) > 0.001) {
      previousHeading = Math.atan2(deltaZ, deltaX);
    }

    previousPoint = point;

    return {
      ...frame,
      point,
      headingRad: previousHeading,
    };
  });
}

function buildEstimatedFrames(frames: TelemetryFrame[]): TelemetryFrame[] {
  const baselineAltitudeM = frames[0]?.altitudeM ?? 0;
  let x = 0;
  let z = 0;
  let headingRad = Math.PI / 10;

  return frames.map((frame, index) => {
    if (index > 0) {
      const previous = frames[index - 1];
      const deltaTimeS =
          Math.max(0, frame.elapsedMs - previous.elapsedMs) / 1000;
      const averageSpeedMs = ((previous.speedKmh + frame.speedKmh) * 0.5) / 3.6;
      const rudderInfluence = normalizeControl(frame.rudder) * 1.15;
      const bankInfluence = degreesToRadians(frame.rollDeg) * 0.65;
      headingRad += (rudderInfluence + bankInfluence) * deltaTimeS;
      const distanceM = averageSpeedMs * deltaTimeS;
      x += Math.cos(headingRad) * distanceM;
      z += Math.sin(headingRad) * distanceM;
    }

    return {
      ...frame,
      point: {
        x,
        y: withAltitudeOffset(frame, baselineAltitudeM),
        z,
      },
      headingRad,
    };
  });
}

export function buildFlightPath(flightLog: ParsedFlightLog): ParsedFlightLog {
  const frames = flightLog.mode === 'gps' ?
      buildGpsFrames(flightLog.frames) :
      buildEstimatedFrames(flightLog.frames);

  return {
    ...flightLog,
    frames,
  };
}
