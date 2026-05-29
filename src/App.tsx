import { useEffect, useState } from 'react'

import './App.css'
import { FlightScene } from './components/FlightScene'
import { PlaybackControls } from './components/PlaybackControls'
import { TelemetryPanel } from './components/TelemetryPanel'
import { buildFlightPath } from './lib/buildFlightPath'
import { clamp, findFrameIndexAtTime, sampleFrameAtTime } from './lib/playback'
import { parseFrskyCsv } from './lib/parseFrskyCsv'
import type { CameraPreset, ParsedFlightLog } from './types'

function App() {
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('chase')
  const [errorMessage, setErrorMessage] = useState('')
  const [flightLog, setFlightLog] = useState<ParsedFlightLog | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [playheadMs, setPlayheadMs] = useState(0)

  const durationMs = flightLog?.summary.durationMs ?? 0
  const currentFrameIndex = flightLog ? findFrameIndexAtTime(flightLog.frames, playheadMs) : 0
  const currentFrame = flightLog?.frames[currentFrameIndex] ?? null
  const sceneFrame = flightLog ? sampleFrameAtTime(flightLog.frames, playheadMs) : null

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
      setCameraPreset('chase')
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

  const summaryCards = [
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
      label: 'Peak speed',
      value: flightLog ? `${flightLog.summary.maxSpeedKmh.toFixed(1)} km/h` : '--',
    },
    {
      label: 'Altitude band',
      value: flightLog
        ? `${flightLog.summary.minAltitudeM.toFixed(1)} to ${flightLog.summary.maxAltitudeM.toFixed(1)} m`
        : '--',
    },
  ]

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">FrSky Flight Replay</p>
          <h1>Upload a radio log and watch the flight in 3D.</h1>
          <p className="hero-copy">
            Simple browser playback with camera angles, a scrub timeline, and telemetry-driven motion.
          </p>
        </div>

        <div className="upload-panel">
          <label className="button button--primary button--file">
            <input type="file" accept=".csv,text/csv" onChange={handleUpload} />
            {isLoading ? 'Loading CSV...' : 'Upload flight CSV'}
          </label>
          <p className="upload-caption">
            {flightLog ? `Loaded ${flightLog.fileName}` : 'Pick a FrSky CSV exported from your radio.'}
          </p>
          {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
        </div>
      </section>

      <section className="content-grid">
        <article className="scene-card">
          <div className="scene-card__header">
            <div>
              <p className="eyebrow">3D View</p>
              <h2>Flight path</h2>
            </div>
            <div className="camera-strip" role="group" aria-label="Camera presets">
              {(['chase', 'cockpit', 'orbit', 'top'] as CameraPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`camera-chip ${cameraPreset === preset ? 'camera-chip--active' : ''}`}
                  onClick={() => setCameraPreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <FlightScene cameraPreset={cameraPreset} currentFrame={sceneFrame} frames={flightLog?.frames ?? []} />
        </article>

        <aside className="sidebar">
          <PlaybackControls
            canPlay={Boolean(flightLog)}
            currentTimeMs={playheadMs}
            durationMs={durationMs}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            onPlayPause={handlePlayPause}
            onRestart={handleRestart}
            onSeek={handleSeek}
            onPlaybackRateChange={setPlaybackRate}
          />

          <TelemetryPanel currentFrame={currentFrame} flightLog={flightLog} />

          <section className="summary-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Flight summary</p>
                <h2>Quick stats</h2>
              </div>
            </div>

            <div className="summary-grid">
              {summaryCards.map((card) => (
                <article key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

export default App
