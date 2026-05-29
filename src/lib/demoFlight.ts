import demoFullFlightCsv from '../assets/demo-full-flight.csv?raw'

import { buildFlightPath } from './buildFlightPath'
import { parseFrskyCsv } from './parseFrskyCsv'

import type { ParsedFlightLog } from '../types'

export function createDemoFlightLog(): ParsedFlightLog {
  const parsed = parseFrskyCsv(demoFullFlightCsv, 'Demo full flight (2026-05-29 09:09:02)')
  return buildFlightPath(parsed)
}
