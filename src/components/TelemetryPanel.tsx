import type { ParsedFlightLog, TelemetryFrame } from '../types'

interface TelemetryPanelProps {
  currentFrame: TelemetryFrame | null
  flightLog: ParsedFlightLog | null
}

function metricValue(value: number | undefined, suffix: string, digits = 1): string {
  if (value === undefined) {
    return '--'
  }

  return `${value.toFixed(digits)}${suffix}`
}

export function TelemetryPanel({ currentFrame, flightLog }: TelemetryPanelProps) {
  return (
    <section className="telemetry-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Telemetry</p>
          <h2>Live frame data</h2>
        </div>
        <span className={`mode-pill ${flightLog?.mode === 'gps' ? 'mode-pill--gps' : ''}`}>
          {flightLog ? `${flightLog.mode === 'gps' ? 'GPS path' : 'Estimated path'}` : 'No flight loaded'}
        </span>
      </div>

      <div className="telemetry-grid">
        <article>
          <span>Altitude</span>
          <strong>{metricValue(currentFrame?.altitudeM, ' m')}</strong>
        </article>
        <article>
          <span>Speed</span>
          <strong>{metricValue(currentFrame?.speedKmh, ' km/h')}</strong>
        </article>
        <article>
          <span>Roll</span>
          <strong>{metricValue(currentFrame?.rollDeg, '°')}</strong>
        </article>
        <article>
          <span>Pitch</span>
          <strong>{metricValue(currentFrame?.pitchDeg, '°')}</strong>
        </article>
        <article>
          <span>Throttle</span>
          <strong>{metricValue(currentFrame?.throttle, '', 0)}</strong>
        </article>
        <article>
          <span>Frame</span>
          <strong>{currentFrame ? `${currentFrame.index + 1}` : '--'}</strong>
        </article>
      </div>

      {flightLog ? (
        <p className="panel-note">
          {flightLog.mode === 'gps'
            ? 'Using GPS coordinates from the log for the flight path.'
            : 'This log has no usable GPS coordinates, so the path is estimated from speed and attitude.'}
        </p>
      ) : (
        <p className="panel-note">Upload a FrSky CSV to populate the replay scene and telemetry.</p>
      )}
    </section>
  )
}