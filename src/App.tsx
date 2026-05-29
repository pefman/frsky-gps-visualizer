import { useEffect, useMemo, useState } from 'react'

import './App.css'
import { FlightScene } from './components/FlightScene'
import { PlaybackControls } from './components/PlaybackControls'
import { TelemetryPanel } from './components/TelemetryPanel'
import { buildFlightPath } from './lib/buildFlightPath'
import { createDemoFlightLog } from './lib/demoFlight'
import {
  buildInterpolatedPlaybackFrames,
  clamp,
  MAX_INTERPOLATION_FPS,
  MIN_INTERPOLATION_FPS,
  findFrameIndexAtTime,
  sampleFrameAtTime,
} from './lib/playback'
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
  const [interpolationFps, setInterpolationFps] = useState(MAX_INTERPOLATION_FPS)

  const durationMs = flightLog?.summary.durationMs ?? 0
  const playbackFrames = useMemo(
    () => (flightLog ? buildInterpolatedPlaybackFrames(flightLog.frames, interpolationFps) : []),
    [flightLog, interpolationFps],
  )
  const currentFrame = useMemo(() => {
    if (!flightLog) {
      return null
    }

    if (interpolationFps === 0) {
      return flightLog.frames[findFrameIndexAtTime(flightLog.frames, playheadMs)] ?? null
    }

    return playbackFrames.length > 0 ? sampleFrameAtTime(playbackFrames, playheadMs) : null
  }, [flightLog, interpolationFps, playbackFrames, playheadMs])
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
    setInterpolationFps(MAX_INTERPOLATION_FPS)
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
                <h2 className="text-lg font-bold text-base-content">Interpolation target</h2>
                <p className="text-xs text-base-content/70">0 = exact source frames, 60 = max target smoothness</p>
              </div>

              <label className="rounded-box border border-base-300 bg-base-200/60 p-2.5">
                <span className="flex items-center justify-between gap-3 text-xs text-base-content/70">
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold text-base-content">Interpolation FPS</strong>
                    <span className="mt-0.5 block">Resamples the log up to 60 fps, independent of source density.</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-base-300 bg-base-100 px-2 py-0.5 text-[11px] font-semibold text-base-content">
                    {interpolationFps === 0 ? 'Exact' : `${interpolationFps} fps`}
                  </span>
                </span>

                <input
                  type="range"
                  min={MIN_INTERPOLATION_FPS}
                  max={MAX_INTERPOLATION_FPS}
                  step={1}
                  value={interpolationFps}
                  onChange={(event) => setInterpolationFps(Number(event.target.value))}
                  className="range range-primary mt-3"
                  aria-label="Interpolation FPS"
                />

                <div className="mt-1 flex justify-between text-[10px] text-base-content/55">
                  <span>0</span>
                  <span>30</span>
                  <span>60</span>
                </div>
              </label>

              <div className="rounded-box border border-base-300 bg-base-200/50 p-2.5 text-xs text-base-content/75">
                <strong className="block text-base-content">Always exact</strong>
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
