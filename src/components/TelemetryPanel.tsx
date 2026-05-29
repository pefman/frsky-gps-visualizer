import type { ParsedFlightLog, TelemetryFrame } from '../types'

interface TelemetryPanelProps {
  currentFrame: TelemetryFrame | null
  flightLog: ParsedFlightLog | null
}

function normalizeStick(value: number | undefined): number {
  if (value === undefined) {
    return 0
  }

  return Math.max(-1, Math.min(1, value / 1024))
}

function metricValue(value: number | undefined, suffix: string, digits = 1): string {
  if (value === undefined) {
    return '--'
  }

  return `${value.toFixed(digits)}${suffix}`
}

export function TelemetryPanel({ currentFrame, flightLog }: TelemetryPanelProps) {
  const rudderX = normalizeStick(currentFrame?.rudder)
  const throttleY = normalizeStick(currentFrame?.throttle)
  const aileronX = normalizeStick(currentFrame?.aileron)
  const elevatorY = normalizeStick(currentFrame?.elevator)

  return (
    <section className="card border border-base-300 bg-base-100/90 shadow-lg">
      <div className="card-body gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">Telemetry</p>
            <h2 className="text-lg font-bold text-base-content">Live frame data</h2>
          </div>
          <span className={`badge badge-outline ${flightLog?.mode === 'gps' ? 'badge-info' : 'badge-warning'}`}>
            {flightLog ? `${flightLog.mode === 'gps' ? 'GPS path' : 'Estimated path'}` : 'No flight loaded'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
            <span className="block text-[11px] text-base-content/65">Altitude</span>
            <strong className="text-base font-semibold text-base-content">{metricValue(currentFrame?.altitudeM, ' m')}</strong>
          </article>
          <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
            <span className="block text-[11px] text-base-content/65">Speed</span>
            <strong className="text-base font-semibold text-base-content">{metricValue(currentFrame?.speedKmh, ' km/h')}</strong>
          </article>
          <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
            <span className="block text-[11px] text-base-content/65">Roll</span>
            <strong className="text-base font-semibold text-base-content">{metricValue(currentFrame?.rollDeg, '°')}</strong>
          </article>
          <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
            <span className="block text-[11px] text-base-content/65">Pitch</span>
            <strong className="text-base font-semibold text-base-content">{metricValue(currentFrame?.pitchDeg, '°')}</strong>
          </article>
          <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
            <span className="block text-[11px] text-base-content/65">RSSI 900M</span>
            <strong className="text-base font-semibold text-base-content">{metricValue(currentFrame?.rssi900MdB, ' dB', 0)}</strong>
          </article>
          <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
            <span className="block text-[11px] text-base-content/65">RSSI 2.4G</span>
            <strong className="text-base font-semibold text-base-content">{metricValue(currentFrame?.rssi24GdB, ' dB', 0)}</strong>
          </article>
          <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
            <span className="block text-[11px] text-base-content/65">Frame</span>
            <strong className="text-base font-semibold text-base-content">{currentFrame ? `${currentFrame.index + 1}` : '--'}</strong>
          </article>
        </div>

        <div className="space-y-2">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">Live stick movements</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
              <span className="mb-1.5 block text-[11px] text-base-content/65">Rudder / Throttle</span>
              <div className="relative mx-auto h-20 w-20 rounded-lg border border-base-300 bg-base-100">
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-base-300" />
                <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-base-300" />
                <div
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-content bg-primary shadow"
                  style={{
                    left: `${((rudderX + 1) / 2) * 100}%`,
                    top: `${((1 - throttleY) / 2) * 100}%`,
                  }}
                />
              </div>
            </article>

            <article className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
              <span className="mb-1.5 block text-[11px] text-base-content/65">Aileron / Elevator</span>
              <div className="relative mx-auto h-20 w-20 rounded-lg border border-base-300 bg-base-100">
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-base-300" />
                <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-base-300" />
                <div
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-secondary-content bg-secondary shadow"
                  style={{
                    left: `${((aileronX + 1) / 2) * 100}%`,
                    top: `${((1 - elevatorY) / 2) * 100}%`,
                  }}
                />
              </div>
            </article>
          </div>
        </div>

        {flightLog ? (
          <p className="text-xs text-base-content/70">
          {flightLog.mode === 'gps'
            ? 'Using GPS coordinates from the log for the flight path.'
            : 'This log has no usable GPS coordinates, so the path is estimated from speed and attitude.'}
          </p>
        ) : (
          <p className="text-xs text-base-content/70">Upload a FrSky CSV to populate the replay scene and telemetry.</p>
        )}
      </div>
    </section>
  )
}