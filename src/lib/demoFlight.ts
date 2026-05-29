import demoSegmentCsv from '../assets/demo-segment.csv?raw'

import { buildFlightPath } from './buildFlightPath'
import { parseFrskyCsv } from './parseFrskyCsv'

import type { ParsedFlightLog } from '../types'

export function createDemoFlightLog(): ParsedFlightLog {
  const parsed = parseFrskyCsv(demoSegmentCsv, 'Demo segment (from your CSV)')
  return buildFlightPath(parsed)
}
