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
  // 135 until s-chess was marked unsupported for its unimplemented gating
  // mechanic (engine#139). placement-chess and sittuyin stay in the count and
  // are now genuinely playable: they were listed here while their placement
  // phase did nothing at all. 134 to 135 when djambi became playable for
  // real: corpses, all six pieces, the centre cell and control transfer
  // (engine#131).
  chess: 135,
  draughts: 13,
  go: 10,
  hex: 8,
  'landlords-game': 1,
  mancala: 6,
  morris: 7,
  // 13 until hasami-shogi was measured capturing 11 times by displacement
  // against 2 custodially - it was playing shogi capture on a hasami board -
  // and marked playable: false (engine#143). A floor going down should always
  // carry a reason, otherwise it stops being a floor.
  shogi: 12,
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

  // Regenerating into a temp file, so the two cases below can share one run
  // each rather than paying the generator's cost twice.
  function generate(suffix) {
    const tmpPath = join(process.cwd(), 'play', `.manifest-check-${suffix}.json`)
    try {
      execSync(
        `node scripts/gen-playability-manifest.mjs`,
        { cwd: process.cwd(), stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules', MANIFEST_OUT: tmpPath } }
      )
      return readFileSync(tmpPath, 'utf8').trim()
    } catch (e) {
      if (e.status) {
        throw new Error('gen-playability-manifest.mjs failed: ' + (e.stderr?.toString() || e.message).slice(0, 300))
      }
      throw e
    } finally {
      try { unlinkSync(tmpPath) } catch {}
    }
  }

  // The generator walks each variant by picking moves at random to decide
  // whether it is playable. Those picks used to come from `Math.random()`, so
  // the same input produced different manifests: four consecutive runs on one
  // commit reported placement-chess unplayable once and playable three times.
  // The freshness check below was intermittently red for that reason and
  // passed on every retry, which is the habit that trains everyone to re-run
  // rather than look (engine#145).
  //
  // The disagreement was the bug, not the check. This asserts the property
  // directly, so a future unseeded call fails here with a reason rather than
  // showing up as a flake somewhere else.
  // Proving byte-identical output directly costs a second full generation, and
  // this file already pays for one. The freshness check below is the empirical
  // half: it compares a fresh run against the committed artifact every CI run,
  // and an unseeded generator makes it red intermittently, which is exactly
  // how this was found. What it could not do was say why. This says why, for
  // the price of reading a file.
  it('the generator draws no unseeded randomness', () => {
    // Both probes that decide playability, not just the one that writes the
    // manifest: the matrix script is the same walk and drifted the same way.
    for (const script of ['gen-playability-manifest.mjs', 'playability-matrix.mjs']) {
      const source = readFileSync(join(process.cwd(), 'scripts', script), 'utf8')
      const code = source.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n')
      expect([script, code.match(/Math\.random/)]).toEqual([script, null])
      expect(code).toMatch(/probePicker\(/)
    }
  })

  // The check above reads the source. That is not enough on its own, and there
  // is a concrete reason to say so: probe-rng.mjs was dropped from a push, the
  // generator could not import it and stopped running entirely, and this file
  // kept reporting "draws no unseeded randomness" because the text still said
  // `probePicker(`. The only thing that noticed was the freshness check, forty
  // seconds later, failing with a module path rather than a cause.
  //
  // So load the thing and use it. A missing or broken picker fails here, in
  // milliseconds, saying what is wrong.
  it('the picker exists, and the same variant always draws the same sequence', async () => {
    const { probePicker, seedFor } = await import('../../../scripts/lib/probe-rng.mjs')
    expect(typeof probePicker).toBe('function')
    expect(typeof seedFor).toBe('function')

    const list = Array.from({ length: 20 }, (_, i) => i)
    const draw = () => {
      const pick = probePicker('chess', 'standard')
      return Array.from({ length: 30 }, () => pick(list))
    }
    expect(draw()).toEqual(draw())

    // ...and a different variant draws a different one, or the seed is doing
    // nothing and every walk is the same walk.
    const other = probePicker('chess', 'progressive')
    const otherSeq = Array.from({ length: 30 }, () => other(list))
    expect(otherSeq).not.toEqual(draw())

    expect(seedFor('chess', 'standard')).toBe(seedFor('chess', 'standard'))
    expect(seedFor('chess', 'standard')).not.toBe(seedFor('chess', 'progressive'))
  })

  it('committed manifest is fresh (matches what gen-playability-manifest.mjs produces)', () => {
    const committed = readFileSync(MANIFEST_PATH, 'utf8').trim()
    expect(generate('fresh')).toBe(committed)
  }, 120_000)
})
