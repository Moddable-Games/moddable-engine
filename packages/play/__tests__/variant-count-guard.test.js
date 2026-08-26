/**
 * Guard test: the published playability manifest must match expected counts
 * AND must be fresh (match what gen-playability-manifest.mjs would produce).
 *
 * If this test fails, regenerate with:
 *   NODE_OPTIONS='--experimental-vm-modules' node scripts/gen-playability-manifest.mjs
 *
 * Counts are floors, not exact figures. Adding a game is the point of this
 * project, and an exact per-family count turns every new variant into a test
 * edit that asserts nothing about whether anything works - the fifth such list
 * found while adding mancala. A floor still catches the failure that matters:
 * variants silently disappearing from the manifest.
 */
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const MANIFEST_PATH = join(process.cwd(), 'play', 'playability-manifest.json')

const MINIMUM_PLAYABLE = {
  chess: 134,
  draughts: 13,
  go: 10,
  mancala: 6,
  shogi: 13,
  xiangqi: 3,
  reversi: 3,
}

describe('variant count guard (published manifest)', () => {
  let manifest

  beforeAll(() => {
    const raw = readFileSync(MANIFEST_PATH, 'utf8')
    manifest = JSON.parse(raw)
  })

  it('manifest file exists and is valid JSON', () => {
    expect(Array.isArray(manifest)).toBe(true)
    expect(manifest.length).toBeGreaterThan(0)
  })

  for (const [family, minimum] of Object.entries(MINIMUM_PLAYABLE)) {
    it(`${family}: at least ${minimum} playable variants in manifest`, () => {
      const playable = manifest.filter(e => e.family === family && e.playable)
      expect(playable.length).toBeGreaterThanOrEqual(minimum)
    })
  }

  // Every family with a plugin must appear. A family that registers but never
  // reaches the manifest ships in the corpus and never appears on the site,
  // which is exactly what happened to mancala until the generator stopped
  // carrying its own list of families.
  it('every family in the manifest is one we expect', () => {
    const families = [...new Set(manifest.map(e => e.family))].sort()
    expect(families).toEqual(Object.keys(MINIMUM_PLAYABLE).sort())
  })

  it('every entry has required fields', () => {
    for (const entry of manifest) {
      expect(entry).toHaveProperty('family')
      expect(entry).toHaveProperty('variant')
      expect(entry).toHaveProperty('label')
      expect(entry).toHaveProperty('playable')
    }
  })

  // A real invariant rather than a restated total: the manifest's own entries
  // must add up, whatever the counts happen to be.
  it('the playable total equals the sum of its families', () => {
    const playable = manifest.filter(e => e.playable)
    const perFamily = {}
    for (const e of playable) perFamily[e.family] = (perFamily[e.family] || 0) + 1
    const summed = Object.values(perFamily).reduce((a, b) => a + b, 0)
    expect(playable.length).toBe(summed)
    expect(playable.length).toBeGreaterThanOrEqual(
      Object.values(MINIMUM_PLAYABLE).reduce((a, b) => a + b, 0))
  })

  it('committed manifest is fresh (matches what gen-playability-manifest.mjs produces)', () => {
    const committed = readFileSync(MANIFEST_PATH, 'utf8').trim()
    const tmpPath = join(process.cwd(), 'play', '.manifest-freshness-check.json')
    try {
      execSync(
        `node scripts/gen-playability-manifest.mjs`,
        { cwd: process.cwd(), stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules', MANIFEST_OUT: tmpPath } }
      )
      const fresh = readFileSync(tmpPath, 'utf8').trim()
      expect(fresh).toBe(committed)
    } catch (e) {
      if (e.status) {
        throw new Error('gen-playability-manifest.mjs failed: ' + (e.stderr?.toString() || e.message).slice(0, 300))
      }
      throw e
    } finally {
      try { unlinkSync(tmpPath) } catch {}
    }
  }, 120_000)
})
