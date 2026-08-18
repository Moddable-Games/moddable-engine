import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORD_PATH = path.resolve(__dirname, '../../../../data/parity-record.json')

// The unresolved count may only go down.
//
// This file previously ended with `expect(blocking.length).toBeGreaterThanOrEqual(0)`,
// which is true for every non-negative number. Measured: an empty record passed 5 of 5,
// and fifty new unresolved divergences passed 5 of 5. The suite reported green while
// asserting nothing about the thing it exists to track.
//
// Lower these two numbers when you resolve an entry. The test tells you to.
// Shape copied from LEGACY_CEILING in packages/play/__tests__/functions-only-all-families.test.js,
// which is the one ratchet in the repo that works.
const UNRESOLVED_CEILING = 2
const MIN_ENTRIES = 5

describe('parity record schema enforcement', () => {
  const record = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8'))

  // Scope assertion. A guard over an empty list passes vacuously, which is how
  // six of this repo's eighteen guards came to assert nothing at all.
  it('the record is non-empty and has not shrunk unexpectedly', () => {
    expect(Array.isArray(record)).toBe(true)
    expect(record.length).toBeGreaterThanOrEqual(MIN_ENTRIES)
  })

  it('every entry has required fields', () => {
    for (const entry of record) {
      expect(entry.variant).toBeTruthy()
      expect(entry.position).toBeTruthy()
      expect(['unresolved', 'resolved']).toContain(entry.status)
      expect(['moves', 'outcome']).toContain(entry.kind)
    }
  })

  it('resolved entries must have authority and verdict', () => {
    for (const entry of record.filter(e => e.status === 'resolved')) {
      expect(entry.authority).toBeTruthy()
      expect(entry.verdict).toBeTruthy()
      expect(['a-wrong', 'b-wrong', 'both-wrong', 'rulebook-ambiguous', 'test-bug'])
        .toContain(entry.verdict)
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

  // No two entries may describe the same divergence. Without this, a duplicate
  // entry inflates the ceiling and the ratchet loosens silently.
  it('entries are unique by variant, position and kind', () => {
    const seen = new Map()
    const dupes = []
    for (const e of record) {
      const key = `${e.variant}|${e.position}|${e.kind}`
      if (seen.has(key)) dupes.push(key)
      seen.set(key, true)
    }
    expect(dupes).toEqual([])
  })

  it('unresolved divergences may only decrease', () => {
    const blocking = record.filter(e => e.status === 'unresolved')

    if (blocking.length > UNRESOLVED_CEILING) {
      const added = blocking.map(e => `${e.variant} (${e.kind}, first seen ${e.firstSeen})`)
      throw new Error(
        `${blocking.length} unresolved parity divergences, ceiling is ${UNRESOLVED_CEILING}.\n`
        + `A divergence means the engine and an external authority disagree about a real\n`
        + `position. Resolve it and record the authority and verdict, or if it is genuinely\n`
        + `new and accepted, raise UNRESOLVED_CEILING deliberately in this file.\n\n`
        + added.map(s => `  ${s}`).join('\n'),
      )
    }

    // Ratchet: when the count drops, the ceiling must come down with it, or the
    // slack silently re-admits a regression later.
    if (blocking.length < UNRESOLVED_CEILING) {
      throw new Error(
        `Only ${blocking.length} unresolved divergences remain but UNRESOLVED_CEILING is `
        + `${UNRESOLVED_CEILING}. Lower the ceiling to ${blocking.length} in this file.`,
      )
    }

    expect(blocking.length).toBe(UNRESOLVED_CEILING)
  })
})
