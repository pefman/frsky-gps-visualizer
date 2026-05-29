import { formatDuration } from '../lib/playback'
import type { TimelineHighlight, TimelineMarker } from '../lib/timelineHighlights'

interface PlaybackControlsProps {
  canPlay: boolean
  currentTimeMs: number
  durationMs: number
  isPlaying: boolean
  playbackRate: number
  timelineHighlights: TimelineHighlight[]
  timelineMarkers: TimelineMarker[]
  onPlayPause: () => void
  onRestart: () => void
  onSeek: (value: number) => void
  onJumpToHighlight: (value: number) => void
  onPlaybackRateChange: (value: number) => void
}

const PLAYBACK_RATES = [0.5, 1, 1.5, 2, 4]

export function PlaybackControls({
  canPlay,
  currentTimeMs,
  durationMs,
  isPlaying,
  playbackRate,
  timelineHighlights,
  timelineMarkers,
  onPlayPause,
  onRestart,
  onSeek,
  onJumpToHighlight,
  onPlaybackRateChange,
}: PlaybackControlsProps) {
  const durationSafe = Math.max(durationMs, 1)
  const playheadPercent = Math.min(100, Math.max(0, (currentTimeMs / durationSafe) * 100))

  const toneClassMap: Record<TimelineHighlight['tone'], string> = {
    info: 'bg-info/70 border-info/80 text-info-content',
    success: 'bg-success/70 border-success/80 text-success-content',
    warning: 'bg-warning/80 border-warning/90 text-warning-content',
    secondary: 'bg-secondary/75 border-secondary/90 text-secondary-content',
  }

  const markerToneClassMap: Record<TimelineMarker['tone'], string> = {
    info: 'bg-info border-info',
    success: 'bg-success border-success',
    warning: 'bg-warning border-warning',
    secondary: 'bg-secondary border-secondary',
  }

  return (
    <section className="card border border-base-300 bg-base-100/90 shadow-lg">
      <div className="card-body gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">Playback</p>
            <h2 className="text-lg font-bold text-base-content">Replay timeline</h2>
          </div>
          <div className="text-right">
            <strong className="block text-lg font-bold text-base-content">{formatDuration(currentTimeMs)}</strong>
            <span className="text-xs text-base-content/65">{formatDuration(durationMs)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={onPlayPause} disabled={!canPlay}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onRestart} disabled={!canPlay}>
            Restart
          </button>

          <label className="ml-auto flex items-center gap-2 text-xs text-base-content/70">
            <span>Speed</span>
            <select
              className="select select-bordered select-sm"
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

        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-primary">Event timeline</p>
            <span className="text-[11px] text-base-content/60">Auto markers + segments (click to jump)</span>
          </div>

          <div className="relative h-11 rounded-box border border-base-300 bg-base-200/60 px-2 py-1.5">
            <div className="absolute left-2 right-2 top-1/2 h-2 -translate-y-1/2 rounded-full bg-base-300/90" />

            <input
              className="absolute left-2 right-2 top-1/2 z-[1] h-6 -translate-y-1/2 cursor-pointer opacity-0"
              type="range"
              min={0}
              max={durationSafe}
              step={1}
              value={Math.min(currentTimeMs, durationMs)}
              onChange={(event) => onSeek(Number(event.target.value))}
              disabled={!canPlay}
              aria-label="Flight timeline"
            />

            {timelineHighlights.length > 0 ? timelineHighlights.map((highlight) => {
              const leftPercent = (highlight.startMs / durationSafe) * 100
              const widthPercent = Math.max(1.8, ((highlight.endMs - highlight.startMs) / durationSafe) * 100)

              return (
                <button
                  key={highlight.id}
                  type="button"
                  className={`absolute top-1.5 z-[2] flex h-7 items-center rounded-md border px-1.5 text-[9px] font-semibold ${toneClassMap[highlight.tone]}`}
                  style={{ left: `calc(2px + ${leftPercent}%)`, width: `max(${widthPercent}%, 2.7rem)` }}
                  onClick={() => onJumpToHighlight(highlight.startMs)}
                  title={`${highlight.label}: ${formatDuration(highlight.startMs)} - ${formatDuration(highlight.endMs)}`}
                >
                  <span className="truncate">{highlight.label}</span>
                </button>
              )
            }) : (
              <div className="absolute inset-x-2 top-1.5 flex h-7 items-center justify-center rounded-md border border-dashed border-base-300 text-[11px] text-base-content/55">
                Load a flight to generate key moments
              </div>
            )}

            {timelineMarkers.map((marker) => {
              const markerPercent = (marker.atMs / durationSafe) * 100

              return (
                <button
                  key={marker.id}
                  type="button"
                  className={`absolute bottom-0.5 z-[3] h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 shadow ${markerToneClassMap[marker.tone]}`}
                  style={{ left: `calc(2px + ${markerPercent}%)` }}
                  onClick={() => onJumpToHighlight(marker.atMs)}
                  title={`${marker.label} at ${formatDuration(marker.atMs)}`}
                />
              )
            })}

            <div
              className="absolute bottom-1 top-1 z-[4] w-0.5 bg-primary"
              style={{ left: `calc(2px + ${playheadPercent}%)` }}
              aria-hidden="true"
            />

            <div
              className="absolute top-1/2 z-[4] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-content bg-primary shadow"
              style={{ left: `calc(2px + ${playheadPercent}%)` }}
              aria-hidden="true"
            />
          </div>

          <div className="flex justify-between text-[10px] text-base-content/60">
            <span>00:00.0</span>
            <span>{formatDuration(durationSafe * 0.5)}</span>
            <span>{formatDuration(durationMs)}</span>
          </div>

          {timelineMarkers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {timelineMarkers.map((marker) => (
                <button
                  key={`chip-${marker.id}`}
                  type="button"
                  className="badge badge-outline gap-1 text-[10px]"
                  onClick={() => onJumpToHighlight(marker.atMs)}
                  title={`Jump to ${marker.label}`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${markerToneClassMap[marker.tone].split(' ')[0]}`} />
                  {marker.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}