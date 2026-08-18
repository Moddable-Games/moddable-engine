import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORD_PATH = path.resolve(__dirname, '../../../../data/parity-record.json')

describe('parity record schema enforcement', () => {
  const record = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8'))

  it('every entry has required fields', () => {
    for (const entry of record) {
      expect(entry.variant).toBeTruthy()
      expect(entry.position).toBeTruthy()
      expect(['unresolved', 'resolved']).toContain(entry.status)
      expect(['moves', 'outcome']).toContain(entry.kind)
    }
  })

  it('resolved entries must have authority and verdict', () => {
    const resolved = record.filter(e => e.status === 'resolved')
    for (const entry of resolved) {
      expect(entry.authority).toBeTruthy()
      expect(entry.verdict).toBeTruthy()
      expect(['a-wrong', 'b-wrong', 'both-wrong', 'rulebook-ambiguous', 'test-bug']).toContain(entry.verdict)
    }
  })

  it('no resolved entry lacks a citation', () => {
    const invalid = record.filter(e => e.status === 'resolved' && (!e.authority || !e.verdict))
    expect(invalid).toEqual([])
  })

  it('every entry has firstSeen date', () => {
    for (const entry of record) {
      expect(entry.firstSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  // Shrink-only ratchet: new unresolved entries must be documented in the record,
  // and the ceiling only drops when entries are resolved.
  const UNRESOLVED_CEILING = 2  // antichess material draw, gridChess checkmate

  it('unresolved count does not exceed ceiling (ratchet)', () => {
    const blocking = record.filter(e => e.status === 'unresolved')
    if (blocking.length > 0) {
      console.log(`Unresolved divergences (${blocking.length}): ${blocking.map(e => e.variant).join(', ')}`)
    }
    expect(blocking.length).toBeLessThanOrEqual(UNRESOLVED_CEILING)
  })

  it('ceiling is not stale (drop it when entries are resolved)', () => {
    const blocking = record.filter(e => e.status === 'unresolved')
    expect(blocking.length).toBe(UNRESOLVED_CEILING)
  })
})
