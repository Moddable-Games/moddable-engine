/**
 * Guard test: the published playability manifest must match expected counts
 * AND must be fresh (match what gen-playability-manifest.mjs would produce).
 *
 * If this test fails, regenerate with:
 *   NODE_OPTIONS='--experimental-vm-modules' node scripts/gen-playability-manifest.mjs
 *
 * Update EXPECTED_PLAYABLE when intentionally adding or removing variants.
 */
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const MANIFEST_PATH = join(process.cwd(), 'play', 'playability-manifest.json')

const EXPECTED_PLAYABLE = {
  chess: 125,
  draughts: 13,
  go: 9,
  shogi: 5,
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

  for (const [family, expected] of Object.entries(EXPECTED_PLAYABLE)) {
    it(`${family}: ${expected} playable variants in manifest`, () => {
      const playable = manifest.filter(e => e.family === family && e.playable)
      expect(playable.length).toBe(expected)
    })
  }

  it('every entry has required fields', () => {
    for (const entry of manifest) {
      expect(entry).toHaveProperty('family')
      expect(entry).toHaveProperty('variant')
      expect(entry).toHaveProperty('label')
      expect(entry).toHaveProperty('playable')
    }
  })

  it('total manifest size equals sum of all families', () => {
    const total = Object.values(EXPECTED_PLAYABLE).reduce((a, b) => a + b, 0)
    const playable = manifest.filter(e => e.playable)
    expect(playable.length).toBe(total)
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
