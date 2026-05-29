import { formatDuration } from '../lib/playback'

interface PlaybackControlsProps {
  canPlay: boolean
  currentTimeMs: number
  durationMs: number
  isPlaying: boolean
  playbackRate: number
  onPlayPause: () => void
  onRestart: () => void
  onSeek: (value: number) => void
  onPlaybackRateChange: (value: number) => void
}

const PLAYBACK_RATES = [0.5, 1, 1.5, 2, 4]

export function PlaybackControls({
  canPlay,
  currentTimeMs,
  durationMs,
  isPlaying,
  playbackRate,
  onPlayPause,
  onRestart,
  onSeek,
  onPlaybackRateChange,
}: PlaybackControlsProps) {
  return (
    <section className="control-panel">
      <div className="control-panel__header">
        <div>
          <p className="eyebrow">Playback</p>
          <h2>Replay timeline</h2>
        </div>
        <p className="time-readout">
          <strong>{formatDuration(currentTimeMs)}</strong>
          <span>{formatDuration(durationMs)}</span>
        </p>
      </div>

      <input
        className="timeline"
        type="range"
        min={0}
        max={Math.max(durationMs, 1)}
        step={1}
        value={Math.min(currentTimeMs, durationMs)}
        onChange={(event) => onSeek(Number(event.target.value))}
        disabled={!canPlay}
        aria-label="Flight timeline"
      />

      <div className="control-row">
        <button type="button" className="button button--primary" onClick={onPlayPause} disabled={!canPlay}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="button button--secondary" onClick={onRestart} disabled={!canPlay}>
          Restart
        </button>

        <label className="speed-select">
          <span>Speed</span>
          <select
            value={playbackRate}
            onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
            disabled={!canPlay}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}