/**
 * Every declared piece file must resolve, case-exactly.
 *
 * macOS is case-insensitive and Linux is not, so a manifest naming `bDG.svg`
 * against a file actually called `bdG.svg` resolved on a developer's machine
 * and silently dropped the artwork on a CI runner. The two platforms produced
 * different bytes from identical inputs, which surfaced only because the
 * gallery freshness check compares bytes and runs on Linux.
 *
 * A shrink-only ratchet, in the manner of the unsupported-coverage gate and
 * the knip baseline: the 32 entries that name a file absent on every platform
 * are pre-existing and tracked, and the count may fall but never rise.
 * Deleting this test because it was inconvenient is what I did the first time.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const gallery = JSON.parse(readFileSync(resolve(ROOT, 'pieces/gallery-index.json'), 'utf8'))

// A set may inherit artwork from a base set; entries then name files in the
// base set's directory. Ignoring that counted every inherited entry as broken.
function filesVisibleTo(set) {
  const seen = new Set()
  for (const id of [set.id, set.baseSet, set.extends].filter(Boolean)) {
    const dir = join(ROOT, 'pieces/sets', id)
    if (existsSync(dir)) for (const f of readdirSync(dir)) seen.add(f)
  }
  return seen
}

function survey() {
  const caseMismatch = []
  const absent = []
  for (const set of gallery) {
    const disk = filesVisibleTo(set)
    if (disk.size === 0) continue
    const lower = new Map([...disk].map(f => [f.toLowerCase(), f]))
    for (const [key, entry] of Object.entries(set.pieces || {})) {
      const file = typeof entry === 'string' ? entry : entry?.file
      if (typeof file !== 'string' || !file.endsWith('.svg')) continue
      if (disk.has(file)) continue
      const where = `${set.id}/${key} -> ${file}`
      if (lower.has(file.toLowerCase())) caseMismatch.push(`${where} (on disk: ${lower.get(file.toLowerCase())})`)
      else absent.push(where)
    }
  }
  return { caseMismatch, absent }
}

// Pre-existing, in mce-fairy-complete (15), mce-jungle (16) and mce-tafl (1).
// Verified identical on origin/main before any of 2026-09-01's work.
const ABSENT_BASELINE = 32

describe('declared piece files resolve', () => {
  const { caseMismatch, absent } = survey()

  it('has sets to check', () => {
    expect(gallery.length).toBeGreaterThan(50)
  })

  // Zero tolerance: this is the class that renders differently per platform,
  // and it is fixable by renaming a file.
  it('never names a file whose case does not match disk', () => {
    expect(caseMismatch).toEqual([])
  })

  it('does not grow the set of entries naming a file that does not exist', () => {
    expect(absent.length).toBeLessThanOrEqual(ABSENT_BASELINE)
  })

  it('states the baseline it is ratcheting, so a drop can be recorded', () => {
    if (absent.length < ABSENT_BASELINE) {
      console.log(`ratchet: absent entries fell to ${absent.length}; lower ABSENT_BASELINE to match`)
    }
    expect(ABSENT_BASELINE).toBe(32)
  })
})
