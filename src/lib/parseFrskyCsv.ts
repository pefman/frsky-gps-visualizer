import Papa from 'papaparse'

import type {ParsedFlightLog, PlaybackMode, TelemetryFrame} from '../types'

type RawRow = Record<string, string>

    const MAX_CONTIGUOUS_GAP_MS = 2_000

const REQUIRED_COLUMNS =
    [
      'Date', 'Time', 'GPS speed(km/h)', 'GPS alt(m)', 'R.angle(°)',
      'P.angle(°)'
    ]

    function toNumber(value: string|undefined):
        number {
          if (!value) {
            return 0
          }

          const parsed = Number.parseFloat(value.trim())
          return Number.isFinite(parsed) ? parsed : 0
        }

function parseTimestamp(date: string, time: string):
    number {
      const parsed = Date.parse(`${date}T${time}`)
      if (Number.isNaN(parsed)) {
        throw new Error(`Unable to parse timestamp from ${date} ${time}`)
      }

      return parsed
    }

function inferNominalStepMs(rows: RawRow[]):
    number {
      const deltas: number[] = []

          for (let index = 1; index < rows.length; index += 1) {
        const previous =
            parseTimestamp(rows[index - 1].Date, rows[index - 1].Time)
        const current = parseTimestamp(rows[index].Date, rows[index].Time)
        const delta = current - previous

        if (delta > 0 && delta <= 1_000) {
          deltas.push(delta)
        }
      }

      if (deltas.length === 0) {
        return 100
      }

      deltas.sort((left, right) => left - right)
      return deltas[Math.floor(deltas.length / 2)]
    }

function parseGpsCoordinates(value: string|undefined):
    {latitude: number|null; longitude: number | null} {
      if (!value) {
        return {
          latitude: null, longitude: null
        }
      }

      const matches = value.match(/-?\d+(?:\.\d+)?/g)
      if (!matches || matches.length < 2) {
        return {
          latitude: null, longitude: null
        }
      }

      const latitude = Number.parseFloat(matches[0])
      const longitude = Number.parseFloat(matches[1])

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return {
          latitude: null, longitude: null
        }
      }

      return {
        latitude, longitude
      }
    }

function ensureRequiredColumns(fields: string[]):
    void {
      const missing =
          REQUIRED_COLUMNS.filter((column) => !fields.includes(column))

      if (missing.length > 0) {
        throw new Error(
            `Missing required telemetry columns: ${missing.join(', ')}`)
      }
    }

function normalizeFrames(rows: RawRow[]):
    {frames: TelemetryFrame[]; mode: PlaybackMode} {
      const populatedRows = rows.filter((row) => row.Date && row.Time)
      if (populatedRows.length === 0) {
        throw new Error('The CSV does not contain any telemetry rows.')
      }

      const firstRawTimestamp =
          parseTimestamp(populatedRows[0].Date, populatedRows[0].Time)
      const nominalStepMs = inferNominalStepMs(populatedRows)
      let elapsedMs = 0
      let previousRawTimestamp = firstRawTimestamp
  const hasGpsCoordinates = populatedRows.some((row) => {
    const gps = parseGpsCoordinates(row.GPS)
    return gps.latitude !== null && gps.longitude !== null
  })

    const mode: PlaybackMode = hasGpsCoordinates ? 'gps' : 'estimated'

    const frames = populatedRows.map((row, index) => {
      const rawTimestamp = parseTimestamp(row.Date, row.Time)
      if (index > 0) {
        const rawDeltaMs = rawTimestamp - previousRawTimestamp

        if (rawDeltaMs > 0 && rawDeltaMs <= MAX_CONTIGUOUS_GAP_MS) {
          elapsedMs += rawDeltaMs
        }
        else {
          elapsedMs += nominalStepMs
        }
      }

      previousRawTimestamp = rawTimestamp

      return {
        index, timestampMs: firstRawTimestamp + elapsedMs, elapsedMs,
            speedKmh: toNumber(row['GPS speed(km/h)']),
            altitudeM: toNumber(row['GPS alt(m)']),
            rollDeg: toNumber(row['R.angle(°)']),
            pitchDeg: toNumber(row['P.angle(°)']),
            throttle: toNumber(row.Throttle), rudder: toNumber(row.Rudder),
            elevator: toNumber(row.Elevator), aileron: toNumber(row.Aileron),
            point: {x: 0, y: 0, z: 0}, headingRad: 0,
            gps: parseGpsCoordinates(row.GPS),
      }
    })

    return {
      frames, mode
    }
    }

export function parseFrskyCsv(csvText: string, fileName: string):
    ParsedFlightLog {
      const parsed = Papa.parse<RawRow>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
      })

      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors[0].message)
      }

      const fields = parsed.meta.fields ?? []
      ensureRequiredColumns(fields)

      const {frames, mode} = normalizeFrames(parsed.data)

      const altitudes = frames.map((frame) => frame.altitudeM)
      const speeds = frames.map((frame) => frame.speedKmh)
      const frameIntervalMs =
          inferNominalStepMs(parsed.data.filter((row) => row.Date && row.Time))
      const frameRateHz = frameIntervalMs > 0 ? 1000 / frameIntervalMs : 0

      return {
        fileName, frames, mode, summary: {
          durationMs: frames.at(-1)?.elapsedMs ?? 0,
          frameIntervalMs,
          frameRateHz,
          maxSpeedKmh: Math.max(...speeds),
          maxAltitudeM: Math.max(...altitudes),
          minAltitudeM: Math.min(...altitudes),
        },
      }
    }