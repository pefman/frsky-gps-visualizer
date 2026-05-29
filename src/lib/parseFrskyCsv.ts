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

function toNullableNumber(value: string|undefined):
    number|null {
      if (!value) {
        return null
      }

      const parsed = Number.parseFloat(value.trim())
      return Number.isFinite(parsed) ? parsed : null
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
      let elapsedMs = 0
      let previousRawTimestamp = firstRawTimestamp
  const hasGpsCoordinates = populatedRows.some((row) => {
    const gps = parseGpsCoordinates(row.GPS)
    return gps.latitude !== null && gps.longitude !== null
  })

    const mode: PlaybackMode = hasGpsCoordinates ? 'gps' : 'estimated'

    const usableRows = hasGpsCoordinates ? populatedRows.filter((row) => {
      const gps = parseGpsCoordinates(row.GPS)
      return gps.latitude !== null && gps.longitude !== null
    }) : populatedRows

    if (usableRows.length === 0) {
      throw new Error('No usable telemetry rows after GPS filtering.')
    }

    const firstUsableTimestamp = parseTimestamp(usableRows[0].Date, usableRows[0].Time)
    const usableNominalStepMs = inferNominalStepMs(usableRows)
    elapsedMs = 0
    previousRawTimestamp = firstUsableTimestamp

    const frames = usableRows.map((row, index) => {
      const rawTimestamp = parseTimestamp(row.Date, row.Time)
      if (index > 0) {
        const rawDeltaMs = rawTimestamp - previousRawTimestamp

        if (rawDeltaMs > 0 && rawDeltaMs <= MAX_CONTIGUOUS_GAP_MS) {
          elapsedMs += rawDeltaMs
        }
        else {
          elapsedMs += usableNominalStepMs
        }
      }

      previousRawTimestamp = rawTimestamp

      return {
        index, timestampMs: firstRawTimestamp + elapsedMs, elapsedMs,
            speedKmh: toNumber(row['GPS speed(km/h)']),
            altitudeM: toNumber(row['GPS alt(m)']),
            rssi900MdB: toNumber(row['RSSI 900M(dB)']),
            rssi24GdB: toNumber(row['RSSI 2.4G(dB)']),
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

function collectSummaryStats(rows: RawRow[], frames: TelemetryFrame[]) {
  const sampleCount = frames.length
  const averageFrameIntervalMs =
      sampleCount > 1 ? frames.at(-1)!.elapsedMs / (sampleCount - 1) : 0
  const frameIntervalMs = inferNominalStepMs(rows)
  const frameRateHz = frameIntervalMs > 0 ? 1000 / frameIntervalMs : 0

  let speedSum = 0
  let speedCount = 0
  let maxRollDeg = Number.NEGATIVE_INFINITY
  let maxPitchDeg = Number.NEGATIVE_INFINITY
  let minTxBatteryV = Number.POSITIVE_INFINITY
  let minRxBatteryV = Number.POSITIVE_INFINITY
  let minRssi900MdB = Number.POSITIVE_INFINITY
  let minRssi24GdB = Number.POSITIVE_INFINITY

  for (const row of rows) {
    const speed = toNullableNumber(row['GPS speed(km/h)'])
    if (speed !== null) {
      speedSum += speed
      speedCount += 1
    }

    const roll = toNullableNumber(row['R.angle(°)'])
    if (roll !== null) {
      maxRollDeg = Math.max(maxRollDeg, Math.abs(roll))
    }

    const pitch = toNullableNumber(row['P.angle(°)'])
    if (pitch !== null) {
      maxPitchDeg = Math.max(maxPitchDeg, Math.abs(pitch))
    }

    const txBattery = toNullableNumber(row['TxBat(V)'])
    if (txBattery !== null) {
      minTxBatteryV = Math.min(minTxBatteryV, txBattery)
    }

    const rxBattery = toNullableNumber(row['RxBatt(V)'])
    if (rxBattery !== null) {
      minRxBatteryV = Math.min(minRxBatteryV, rxBattery)
    }

    const rssi900 = toNullableNumber(row['RSSI 900M(dB)'])
    if (rssi900 !== null) {
      minRssi900MdB = Math.min(minRssi900MdB, rssi900)
    }

    const rssi24 = toNullableNumber(row['RSSI 2.4G(dB)'])
    if (rssi24 !== null) {
      minRssi24GdB = Math.min(minRssi24GdB, rssi24)
    }
  }

  return {
    sampleCount, averageFrameIntervalMs, frameIntervalMs, frameRateHz,
        averageSpeedKmh: speedCount > 0 ? speedSum / speedCount : 0,
        maxRollDeg: maxRollDeg === Number.NEGATIVE_INFINITY ? 0 : maxRollDeg,
        maxPitchDeg: maxPitchDeg === Number.NEGATIVE_INFINITY ? 0 : maxPitchDeg,
        minTxBatteryV: minTxBatteryV === Number.POSITIVE_INFINITY ?
        0 :
        minTxBatteryV,
        minRxBatteryV: minRxBatteryV === Number.POSITIVE_INFINITY ?
        0 :
        minRxBatteryV,
        minRssi900MdB: minRssi900MdB === Number.POSITIVE_INFINITY ?
        0 :
        minRssi900MdB,
        minRssi24GdB: minRssi24GdB === Number.POSITIVE_INFINITY ? 0 :
                                                                  minRssi24GdB,
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

      const normalizedRows = mode === 'gps'
        ? parsed.data.filter((row) => {
            if (!row.Date || !row.Time) {
              return false
            }
            const gps = parseGpsCoordinates(row.GPS)
            return gps.latitude !== null && gps.longitude !== null
          })
        : parsed.data.filter((row) => row.Date && row.Time)

      const altitudes = frames.map((frame) => frame.altitudeM)
      const speeds = frames.map((frame) => frame.speedKmh)
      const summaryStats = collectSummaryStats(
          normalizedRows, frames)

      return {
        fileName, frames, mode, summary: {
          sampleCount: summaryStats.sampleCount,
          durationMs: frames.at(-1)?.elapsedMs ?? 0,
          frameIntervalMs: summaryStats.frameIntervalMs,
          averageFrameIntervalMs: summaryStats.averageFrameIntervalMs,
          frameRateHz: summaryStats.frameRateHz,
          averageSpeedKmh: summaryStats.averageSpeedKmh,
          maxSpeedKmh: Math.max(...speeds),
          maxRollDeg: summaryStats.maxRollDeg,
          maxPitchDeg: summaryStats.maxPitchDeg,
          maxAltitudeM: Math.max(...altitudes),
          minAltitudeM: Math.min(...altitudes),
          minTxBatteryV: summaryStats.minTxBatteryV,
          minRxBatteryV: summaryStats.minRxBatteryV,
          minRssi900MdB: summaryStats.minRssi900MdB,
          minRssi24GdB: summaryStats.minRssi24GdB,
        },
      }
    }