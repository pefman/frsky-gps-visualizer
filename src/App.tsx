import { useEffect, useState } from 'react'

import './App.css'
import { FlightScene } from './components/FlightScene'
import { PlaybackControls } from './components/PlaybackControls'
import { TelemetryPanel } from './components/TelemetryPanel'
import { buildFlightPath } from './lib/buildFlightPath'
import { createDemoFlightLog } from './lib/demoFlight'
import { clamp, sampleFrameAtTime } from './lib/playback'
import { parseFrskyCsv } from './lib/parseFrskyCsv'
import type { ParsedFlightLog } from './types'

function App() {
  const [errorMessage, setErrorMessage] = useState('')
  const [flightLog, setFlightLog] = useState<ParsedFlightLog | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [playheadMs, setPlayheadMs] = useState(0)
  const [showTrailLines, setShowTrailLines] = useState(false)
  const [motionSmoothing, setMotionSmoothing] = useState(0)

  const durationMs = flightLog?.summary.durationMs ?? 0
  const currentFrame = flightLog ? sampleFrameAtTime(flightLog.frames, playheadMs) : null

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
          <div className="upload-actions">
            <label className="button button--primary button--file">
              <input type="file" accept=".csv,text/csv" onChange={handleUpload} />
              {isLoading ? 'Loading CSV...' : 'Upload flight CSV'}
            </label>
            <button
              type="button"
              className="button button--secondary"
              onClick={handleLoadDemo}
            >
              Load demo
            </button>
          </div>
          <p className="upload-caption">
            {flightLog ? `Loaded ${flightLog.fileName}` : 'Pick a FrSky CSV exported from your radio.'}
          </p>
          {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
        </div>
      </section>

      <section className="content-grid">
        <aside className="left-sidebar">
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

          <section className="control-panel motion-smoothing-panel" aria-label="Motion smoothing">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Motion filter</p>
                <h2>Smoothing</h2>
              </div>
              <strong className="smoothing-readout">{Math.round(motionSmoothing * 100)}%</strong>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={motionSmoothing}
              onChange={(event) => setMotionSmoothing(Number(event.target.value))}
              className="timeline"
            />
            <p className="panel-note">0% is raw motion. Increase to smooth all aircraft movement and attitude.</p>
          </section>

        </aside>

        <article className="scene-card">
          <div className="scene-card__header">
            <div>
              <p className="eyebrow">3D View</p>
              <h2>Pilot view</h2>
            </div>
            <button
              type="button"
              className={`button button--secondary ${showTrailLines ? 'button--active' : ''}`}
              onClick={() => setShowTrailLines((current) => !current)}
            >
              {showTrailLines ? 'Hide lines' : 'Show lines'}
            </button>
          </div>

          <FlightScene
            currentFrame={currentFrame}
            frames={flightLog?.frames ?? []}
            showTrail={showTrailLines}
            motionSmoothing={motionSmoothing}
          />
        </article>

        <aside className="right-sidebar">
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
