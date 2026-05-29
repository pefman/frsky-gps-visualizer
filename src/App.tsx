import { useEffect, useMemo, useState } from 'react'

import './App.css'
import { FlightScene } from './components/FlightScene'
import { PlaybackControls } from './components/PlaybackControls'
import { TelemetryPanel } from './components/TelemetryPanel'
import { buildFlightPath } from './lib/buildFlightPath'
import { createDemoFlightLog } from './lib/demoFlight'
import { clamp, DEFAULT_INTERPOLATION_SETTINGS, sampleFrameAtTime } from './lib/playback'
import { parseFrskyCsv } from './lib/parseFrskyCsv'
import { buildTimelineHighlights, buildTimelineMarkers } from './lib/timelineHighlights'
import type { ParsedFlightLog } from './types'

function App() {
  const [errorMessage, setErrorMessage] = useState('')
  const [flightLog, setFlightLog] = useState<ParsedFlightLog | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [showTrailLines, setShowTrailLines] = useState(false)
  const [showPathTrail, setShowPathTrail] = useState(false)
  const [motionSmoothing, setMotionSmoothing] = useState(0)
  const [interpolationSettings, setInterpolationSettings] = useState(DEFAULT_INTERPOLATION_SETTINGS)

  const durationMs = flightLog?.summary.durationMs ?? 0
  const currentFrame = flightLog ? sampleFrameAtTime(flightLog.frames, playheadMs, interpolationSettings) : null
  const timelineHighlights = useMemo(() => buildTimelineHighlights(flightLog), [flightLog])
  const timelineMarkers = useMemo(
    () => buildTimelineMarkers(flightLog, timelineHighlights),
    [flightLog, timelineHighlights],
  )

  useEffect(() => {
    if (!isPlaying || !flightLog) {
      return undefined
    }

    let animationFrameId = 0
    let previousTimestamp = 0

    const step = (timestamp: number) => {
      if (previousTimestamp === 0) {
        previousTimestamp = timestamp
      }

      const delta = timestamp - previousTimestamp
      previousTimestamp = timestamp

      setPlayheadMs((current) => {
        const next = current + delta * playbackRate
        if (next >= flightLog.summary.durationMs) {
          setIsPlaying(false)
          return flightLog.summary.durationMs
        }

        return next
      })

      animationFrameId = window.requestAnimationFrame(step)
    }

    animationFrameId = window.requestAnimationFrame(step)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [flightLog, isPlaying, playbackRate])

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      setIsLoading(true)
      setErrorMessage('')
      setIsPlaying(false)

      const csvText = await file.text()
      const parsed = buildFlightPath(parseFrskyCsv(csvText, file.name))

      setFlightLog(parsed)
      setPlayheadMs(0)
      setIsPlaying(true)
    } catch (error) {
      setFlightLog(null)
      setPlayheadMs(0)
      setErrorMessage(error instanceof Error ? error.message : 'Unable to read the selected CSV file.')
    } finally {
      setIsLoading(false)
    }
  }

  function handlePlayPause() {
    if (!flightLog) {
      return
    }

    if (playheadMs >= flightLog.summary.durationMs) {
      setPlayheadMs(0)
    }

    setIsPlaying((current) => !current)
  }

  function handleRestart() {
    setPlayheadMs(0)
    setIsPlaying(false)
  }

  function handleSeek(value: number) {
    setPlayheadMs(clamp(value, 0, durationMs))
  }

  function handleJumpToHighlight(value: number) {
    if (!flightLog) {
      return
    }

    setPlayheadMs(clamp(value, 0, durationMs))
    setIsPlaying(true)
  }

  function handleLoadDemo() {
    setErrorMessage('')
    setIsPlaying(false)
    setFlightLog(createDemoFlightLog())
    setPlayheadMs(0)
    setMotionSmoothing(1)
    setIsPlaying(true)
  }

  const summaryCards = [
    {
      label: 'Samples',
      value: flightLog ? `${flightLog.summary.sampleCount}` : '--',
    },
    {
      label: 'Duration',
      value: flightLog ? `${Math.round(flightLog.summary.durationMs / 1000)}s` : '--',
    },
    {
      label: 'Frame updates',
      value: flightLog
        ? `${flightLog.summary.frameRateHz.toFixed(1)} Hz (${flightLog.summary.frameIntervalMs.toFixed(0)} ms)`
        : '--',
    },
    {
      label: 'Average interval',
      value: flightLog ? `${flightLog.summary.averageFrameIntervalMs.toFixed(1)} ms` : '--',
    },
    {
      label: 'Average speed',
      value: flightLog ? `${flightLog.summary.averageSpeedKmh.toFixed(1)} km/h` : '--',
    },
    {
      label: 'Peak speed',
      value: flightLog ? `${flightLog.summary.maxSpeedKmh.toFixed(1)} km/h` : '--',
    },
    {
      label: 'Max roll',
      value: flightLog ? `${flightLog.summary.maxRollDeg.toFixed(1)}°` : '--',
    },
    {
      label: 'Max pitch',
      value: flightLog ? `${flightLog.summary.maxPitchDeg.toFixed(1)}°` : '--',
    },
    {
      label: 'Tx battery',
      value: flightLog ? `${flightLog.summary.minTxBatteryV.toFixed(2)} V` : '--',
    },
    {
      label: 'Rx battery',
      value: flightLog ? `${flightLog.summary.minRxBatteryV.toFixed(2)} V` : '--',
    },
    {
      label: 'RSSI 900M',
      value: flightLog ? `${flightLog.summary.minRssi900MdB.toFixed(0)} dB` : '--',
    },
    {
      label: 'RSSI 2.4G',
      value: flightLog ? `${flightLog.summary.minRssi24GdB.toFixed(0)} dB` : '--',
    },
    {
      label: 'Altitude band',
      value: flightLog
        ? `${flightLog.summary.minAltitudeM.toFixed(1)} to ${flightLog.summary.maxAltitudeM.toFixed(1)} m`
        : '--',
    },
  ]

  const interpolatedChannels = [
    { key: 'position', label: 'Position X/Y/Z' },
    { key: 'heading', label: 'Heading' },
    { key: 'speed', label: 'Speed' },
    { key: 'altitude', label: 'Altitude' },
    { key: 'roll', label: 'Roll' },
    { key: 'pitch', label: 'Pitch' },
    { key: 'throttle', label: 'Throttle' },
    { key: 'rudder', label: 'Rudder' },
    { key: 'elevator', label: 'Elevator' },
    { key: 'aileron', label: 'Aileron' },
  ] as const

  function handleInterpolationToggle(key: keyof typeof interpolationSettings) {
    setInterpolationSettings((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function handleToggleAllInterpolation(enabled: boolean) {
    setInterpolationSettings((current) => {
      const next = { ...current }
      for (const { key } of interpolatedChannels) {
        next[key] = enabled
      }
      return next
    })
  }

  function handleResetInterpolationSettings() {
    setInterpolationSettings(DEFAULT_INTERPOLATION_SETTINGS)
  }

  const activeInterpolationCount = interpolatedChannels.filter(({ key }) => interpolationSettings[key]).length
  const allInterpolationEnabled = activeInterpolationCount === interpolatedChannels.length

  const exactChannels = [
    'RSSI 900M',
    'RSSI 2.4G',
    'Frame index',
    'Source timestamps',
  ]

  return (
    <main className="mx-auto flex w-full max-w-[1880px] flex-col gap-5 p-3 md:p-5">
      <section className="card border border-base-300 bg-base-100/90 shadow-xl">
        <div className="card-body gap-2 py-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">FrSky Flight Replay</p>
            <h1 className="truncate text-base font-bold text-base-content md:text-lg">
              Upload a radio log and watch the flight in 3D.
            </h1>
          </div>

          <div className="min-w-0 space-y-1.5 md:min-w-72">
            <div className="flex flex-wrap gap-1.5">
              <label className="btn btn-primary btn-sm">
                <input type="file" accept=".csv,text/csv" onChange={handleUpload} className="hidden" />
              {isLoading ? 'Loading CSV...' : 'Upload flight CSV'}
              </label>
              <button type="button" className="btn btn-outline btn-sm" onClick={handleLoadDemo}>
                Load demo
              </button>
            </div>
            <p className="text-xs text-base-content/70">
              {flightLog ? `Loaded ${flightLog.fileName}` : 'Pick a FrSky CSV exported from your radio.'}
            </p>
            {errorMessage ? <div className="alert alert-error py-1.5 text-xs">{errorMessage}</div> : null}
          </div>
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)_minmax(15rem,19rem)]">
        <aside className="grid gap-3 md:grid-cols-2 xl:flex xl:flex-col">
          <section className="card border border-base-300 bg-base-100/90 shadow-lg">
            <div className="card-body gap-3 p-4">
              <div>
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">Flight summary</p>
                <h2 className="text-lg font-bold text-base-content">Quick stats</h2>
              </div>

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {summaryCards.map((card) => (
                  <article key={card.label} className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
                    <span className="block text-[11px] text-base-content/65">{card.label}</span>
                    <strong className="text-sm font-semibold text-base-content">{card.value}</strong>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="card border border-base-300 bg-base-100/90 shadow-lg">
            <div className="card-body gap-3 p-4">
              <div>
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">Playback math</p>
                <h2 className="text-lg font-bold text-base-content">Interpolated channels</h2>
                <p className="text-xs text-base-content/70">Enabled {activeInterpolationCount} of {interpolatedChannels.length}</p>
              </div>

              <label className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
                <span className="flex items-center justify-between gap-2">
                  <span>
                    <strong className="block text-sm font-semibold text-base-content">Interpolate all</strong>
                    <span className="mt-0.5 block text-[11px] text-base-content/65">
                      Toggle every channel below at once
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={allInterpolationEnabled}
                    onChange={(event) => handleToggleAllInterpolation(event.target.checked)}
                  />
                </span>
              </label>

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {interpolatedChannels.map(({ key, label }) => (
                  <label key={key} className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
                    <span className="flex items-start justify-between gap-2">
                      <span>
                        <strong className="block text-sm font-semibold text-base-content">{label}</strong>
                        <span className="mt-0.5 block text-[11px] text-base-content/65">
                          {interpolationSettings[key] ? 'Interpolated' : 'Exact source frame'}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="toggle toggle-sm"
                        checked={interpolationSettings[key]}
                        onChange={() => handleInterpolationToggle(key)}
                      />
                    </span>
                  </label>
                ))}
              </div>

              <button type="button" className="btn btn-ghost btn-xs self-start" onClick={handleResetInterpolationSettings}>
                Reset to defaults
              </button>

              <div className="rounded-box border border-base-300 bg-base-200/50 p-2.5 text-xs text-base-content/75">
                <strong className="block text-base-content">Exact (not interpolated)</strong>
                <span>{exactChannels.join(', ')}.</span>
              </div>
            </div>
          </section>
        </aside>

        <article className="card border border-base-300 bg-base-100/90 shadow-xl">
          <div className="card-body gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">3D View</p>
                <h2 className="text-lg font-bold text-base-content">Pilot view</h2>
              </div>
            </div>

            {flightLog ? (
              <FlightScene
                currentFrame={currentFrame}
                frames={flightLog.frames}
                showTrail={showTrailLines}
                showPathTrail={showPathTrail}
                onToggleShowTrail={() => setShowTrailLines((current) => !current)}
                onToggleShowPathTrail={() => setShowPathTrail((current) => !current)}
                motionSmoothing={motionSmoothing}
                onMotionSmoothingChange={setMotionSmoothing}
              />
            ) : (
              <div className="scene-view flex items-center justify-center">
                <div className="space-y-3 rounded-box border border-base-300 bg-base-100/85 p-6 text-center shadow">
                  <p className="text-sm text-base-content/70">No flight loaded</p>
                  <h3 className="text-xl font-bold text-base-content">Load a CSV file or start demo</h3>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <label className="btn btn-primary btn-sm">
                      <input type="file" accept=".csv,text/csv" onChange={handleUpload} className="hidden" />
                      {isLoading ? 'Loading CSV...' : 'Load file'}
                    </label>
                    <button type="button" className="btn btn-outline btn-sm" onClick={handleLoadDemo}>
                      Load demo
                    </button>
                  </div>
                </div>
              </div>
            )}

            <PlaybackControls
              canPlay={Boolean(flightLog)}
              currentTimeMs={playheadMs}
              durationMs={durationMs}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              motionSmoothing={motionSmoothing}
              timelineHighlights={timelineHighlights}
              timelineMarkers={timelineMarkers}
              onPlayPause={handlePlayPause}
              onRestart={handleRestart}
              onMotionSmoothingChange={setMotionSmoothing}
              onSeek={handleSeek}
              onJumpToHighlight={handleJumpToHighlight}
              onPlaybackRateChange={setPlaybackRate}
            />
          </div>
        </article>

        <aside className="grid gap-3">
          <TelemetryPanel currentFrame={currentFrame} flightLog={flightLog} />
        </aside>
      </section>
    </main>
  )
}

export default App
