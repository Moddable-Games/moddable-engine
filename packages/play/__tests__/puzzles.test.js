/**
 * The puzzle pool, checked against the engine that has to play it.
 *
 * api/puzzles/index.json is normalised by scripts/normalise-puzzles.mjs, which
 * adds `position` (the FEN the solver actually faces, after `setupMove` where
 * one is present), `turn` and `variantSlug`. This suite proves two separate
 * things about that file:
 *
 * 1. The schema holds — every record carries the three added fields, `position`
 *    differs from `fen` exactly when a `setupMove` is present, and every
 *    `variantSlug` is a real key in play/playability-manifest.json.
 *
 * 2. The puzzles are actually correct — the first move of every solution is in
 *    the engine's legal move list for `position`, and for standard chess the
 *    whole line plays out. Nothing in the repo asserted this before. A puzzle
 *    whose solution is illegal is not a hard puzzle, it is a broken record, and
 *    a consumer that renders it hands the player an unsolvable board.
 *
 * Records whose variant the engine cannot instantiate at all are skipped, but
 * counted and printed rather than passing silently. A FEN the engine refuses to
 * load is NOT a skip: the variant instantiates, so a FEN it cannot parse means
 * the record carries pieces that variant does not have, which is a defect in
 * the data and is counted as such.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import '../test-helpers/setup-rules-reader.js'
import '../../plugins/chess/index.js'
import { createGameForVariant, loadFen, findLegalMove } from '../src/fen.js'

/**
 * KNOWN_BROKEN is a ledger, not a mute button.
 *
 * It exists so this suite can be green while the debt stays counted and visible
 * on every run. Every entry is a puzzle that CANNOT BE SOLVED AS SHIPPED: a
 * consumer rendering it hands the player a board where the recorded answer is
 * not a legal move. The target is zero.
 *
 * Rules for this file:
 *   - Never add an entry to make a failure go away. An entry needs a recorded
 *     reason, which here means the cause class below and, if it is a new kind of
 *     breakage, a new cause class with a comment explaining it.
 *   - The ledger may only shrink. LEDGER_CEILING enforces that, and a ledger
 *     entry that starts passing fails the suite as a stale entry, so fixing a
 *     puzzle forces you to delete its line.
 *   - Regenerate rather than hand-edit: the entries came from a full run against
 *     the real data file, grouped by variant.
 *
 * Cause classes:
 *   unloadable-vocabulary  the FEN uses piece letters the variant never declares
 *   illegal-move           position loads, recorded solution move is not legal
 *   fen-past-solution      the FEN is already one ply past its own solution
 *   line-illegal           first move is legal, the rest of the line is not
 */
const KNOWN_BROKEN = {
  // Quarantine completed 2026-08-18: 150 broken puzzles moved to api/puzzles/index.json
  // rejected block. The ledger is now empty. If new breakage appears, add entries here
  // following the cause-class pattern from the original ledger.
}

// The headline numbers this suite defends. Both may go down, never up.
const LEDGER_CEILING = 0              // total ledger entries (was 150 before quarantine)
const FIRST_MOVE_CEILING = 0          // of those, records with an illegal FIRST move
const SOLVABLE_VARIANTS_FLOOR = 610   // of 610 variant puzzles after quarantine, all are solvable

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..', '..')
const FAMILY = 'chess'

const pool = JSON.parse(readFileSync(join(ROOT, 'api', 'puzzles', 'index.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(ROOT, 'play', 'playability-manifest.json'), 'utf8'))
const manifestKeys = new Set(manifest.filter(entry => entry.family === FAMILY).map(entry => entry.key))

const BUCKETS = [
  ['standard', pool.standard],
  ['variants', pool.variants],
]

// A ledger entry with this cause passes the first-move check and fails only the
// whole-line check, so the two assertions consult different slices of the ledger.
const LINE_ONLY_CAUSE = 'line-illegal'

// One game per variant; loadFen replaces the whole slice each time.
const games = new Map()
const uninstantiable = new Map()

function gameFor(slug) {
  if (games.has(slug)) return games.get(slug)
  let game = null
  try {
    game = createGameForVariant(FAMILY, slug)
  } catch (error) {
    uninstantiable.set(slug, error.message)
  }
  games.set(slug, game)
  return game
}

/**
 * Classify one record against the engine, in a single pass so the ledger checks
 * and the printed summary agree by construction.
 * Returns { firstMove, line } where each is 'ok' | 'skipped-variant' | a cause.
 */
function analyse(record, bucket) {
  const game = gameFor(record.variantSlug)
  if (!game) {
    return { firstMove: 'skipped-variant', line: 'skipped-variant', reason: uninstantiable.get(record.variantSlug) }
  }

  try {
    loadFen(game, record.position)
  } catch (error) {
    return { firstMove: 'unloadable-vocabulary', line: 'unloadable-vocabulary', reason: error.message }
  }

  if (!findLegalMove(game, record.solution[0])) {
    // A historical record whose FEN sits past its own solution is a different
    // defect from a generator and engine disagreeing about a piece's moves.
    const cause = record.source === 'historical' ? 'fen-past-solution' : 'illegal-move'
    return { firstMove: cause, line: cause, reason: `no legal move matches "${record.solution[0]}"`, failedAt: 0 }
  }

  if (bucket !== 'standard') return { firstMove: 'ok', line: 'ok' }

  loadFen(game, record.position)
  for (let i = 0; i < record.solution.length; i++) {
    const move = findLegalMove(game, record.solution[i])
    if (!move) {
      return { firstMove: 'ok', line: LINE_ONLY_CAUSE, reason: `"${record.solution[i]}" is not legal at ply ${i}`, failedAt: i }
    }
    const result = game.applyMove(move)
    if (result && result.ok === false) {
      return { firstMove: 'ok', line: LINE_ONLY_CAUSE, reason: `engine rejected "${record.solution[i]}": ${result.reason}`, failedAt: i }
    }
  }
  return { firstMove: 'ok', line: 'ok' }
}

// Single eager pass: the assertions below only read from this.
const ANALYSIS = new Map()
for (const [bucket, records] of BUCKETS) {
  for (const record of records) ANALYSIS.set(record.id, { bucket, record, ...analyse(record, bucket) })
}

const ledgerIds = new Set(Object.keys(KNOWN_BROKEN))
const firstMoveLedgerIds = [...ledgerIds].filter(id => KNOWN_BROKEN[id] !== LINE_ONLY_CAUSE)

function describeFailure({ record, reason, failedAt }) {
  return `  ${record.id} (${record.variantSlug})\n` +
    `    position: ${record.position}\n` +
    `    move:     ${record.solution[failedAt || 0]}\n` +
    `    why:      ${reason}`
}

function tally(entries, key) {
  const counts = {}
  for (const entry of entries) {
    const bucketKey = typeof key === 'function' ? key(entry) : entry[key]
    counts[bucketKey] = (counts[bucketKey] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

describe('puzzle pool schema (v2)', () => {
  it('meta declares schemaVersion 2 and a normalisation date', () => {
    expect(pool.meta.schemaVersion).toBe(2)
    expect(pool.meta.normalised).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  for (const [bucket, records] of BUCKETS) {
    describe(bucket, () => {
      it('every record has position, turn and variantSlug', () => {
        const missing = records.filter(r => !r.position || !r.turn || !r.variantSlug)
        expect(missing.map(r => r.id)).toEqual([])
      })

      it('turn matches the side to move in position', () => {
        const wrong = records.filter(r => {
          const side = r.position.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white'
          return r.turn !== side
        })
        expect(wrong.map(r => r.id)).toEqual([])
      })

      it('position differs from fen exactly when setupMove is present', () => {
        const wrong = records.filter(r => (r.setupMove ? r.position === r.fen : r.position !== r.fen))
        expect(wrong.map(r => r.id)).toEqual([])
      })

      it('every variantSlug is a key in play/playability-manifest.json', () => {
        const unknown = [...new Set(records.map(r => r.variantSlug).filter(slug => !manifestKeys.has(slug)))]
        expect(unknown).toEqual([])
      })
    })
  }
})

describe('puzzle pool legality', () => {
  // Without a moddable-rules checkout the engine cannot build a single variant
  // and every legality check below would skip its way to green.
  it('the engine can instantiate plain chess', () => {
    expect(gameFor('standard')).not.toBeNull()
  })

  for (const [bucket, records] of BUCKETS) {
    describe(bucket, () => {
      it('every first solution move is legal in position, or is a recorded ledger entry', () => {
        const unexpected = []
        const miscategorised = []
        for (const record of records) {
          const result = ANALYSIS.get(record.id)
          if (result.firstMove === 'ok' || result.firstMove === 'skipped-variant') continue
          const recorded = KNOWN_BROKEN[record.id]
          if (!recorded) unexpected.push(result)
          else if (recorded !== result.firstMove) miscategorised.push({ ...result, recorded })
        }

        // A ledger entry that now passes is stale: the ledger must shrink honestly.
        const stale = records
          .filter(r => KNOWN_BROKEN[r.id] && KNOWN_BROKEN[r.id] !== LINE_ONLY_CAUSE)
          .filter(r => ANALYSIS.get(r.id).firstMove === 'ok')

        const problems = []
        if (unexpected.length > 0) {
          problems.push(
            `${unexpected.length} ${bucket} puzzle(s) have an illegal first solution move and are NOT in KNOWN_BROKEN.\n` +
            unexpected.slice(0, 5).map(describeFailure).join('\n')
          )
        }
        if (miscategorised.length > 0) {
          problems.push(
            `${miscategorised.length} ledger entry(ies) broke differently than recorded:\n` +
            miscategorised.slice(0, 5).map(r => `  ${r.record.id}: ledger says ${r.recorded}, engine says ${r.firstMove}`).join('\n')
          )
        }
        if (stale.length > 0) {
          problems.push(
            `${stale.length} KNOWN_BROKEN entry(ies) now pass — delete them from the ledger:\n` +
            stale.map(r => `  ${r.id} (${r.variantSlug}): ${KNOWN_BROKEN[r.id]}`).join('\n')
          )
        }
        if (problems.length > 0) throw new Error(problems.join('\n\n'))
      })

      if (bucket === 'standard') {
        it('the whole solution line plays out, or is a recorded ledger entry', () => {
          const unexpected = records
            .map(r => ANALYSIS.get(r.id))
            .filter(r => r.line !== 'ok' && r.line !== 'skipped-variant' && !KNOWN_BROKEN[r.record.id])

          const stale = records
            .filter(r => KNOWN_BROKEN[r.id])
            .filter(r => ANALYSIS.get(r.id).line === 'ok')

          const problems = []
          if (unexpected.length > 0) {
            problems.push(
              `${unexpected.length} standard puzzle line(s) do not play out and are NOT in KNOWN_BROKEN.\n` +
              unexpected.slice(0, 5).map(describeFailure).join('\n')
            )
          }
          if (stale.length > 0) {
            problems.push(
              `${stale.length} KNOWN_BROKEN entry(ies) now play out — delete them from the ledger:\n` +
              stale.map(r => `  ${r.id}: ${KNOWN_BROKEN[r.id]}`).join('\n')
            )
          }
          if (problems.length > 0) throw new Error(problems.join('\n\n'))
        })
      }
    })
  }

  it('every ledger entry is a real record in the pool', () => {
    const orphans = [...ledgerIds].filter(id => !ANALYSIS.has(id))
    expect(orphans).toEqual([])
  })

  it('the ledger only shrinks', () => {
    expect(ledgerIds.size).toBeLessThanOrEqual(LEDGER_CEILING)
    expect(firstMoveLedgerIds.length).toBeLessThanOrEqual(FIRST_MOVE_CEILING)
  })

  it('the solvable share of the variant pool only grows', () => {
    const solvable = pool.variants.filter(r => ANALYSIS.get(r.id).firstMove === 'ok').length
    expect(solvable).toBeGreaterThanOrEqual(SOLVABLE_VARIANTS_FLOOR)
    expect(solvable + pool.variants.filter(r => ANALYSIS.get(r.id).firstMove !== 'ok').length).toBe(pool.variants.length)
  })

  afterAll(() => {
    const all = [...ANALYSIS.values()]
    const broken = all.filter(r => r.firstMove !== 'ok' && r.firstMove !== 'skipped-variant')
    const lineOnly = all.filter(r => r.firstMove === 'ok' && r.line !== 'ok' && r.line !== 'skipped-variant')
    const skipped = all.filter(r => r.firstMove === 'skipped-variant')
    const solvableVariants = pool.variants.filter(r => ANALYSIS.get(r.id).firstMove === 'ok').length
    const share = ((solvableVariants / pool.variants.length) * 100).toFixed(1)

    const lines = []
    lines.push('\n=== Puzzle legality ===')
    lines.push(`HEADLINE: ${solvableVariants} of ${pool.variants.length} variant puzzles (${share}%) are solvable as shipped.`)
    lines.push(`KNOWN_BROKEN ledger: ${ledgerIds.size} entries (ceiling ${LEDGER_CEILING}); ${firstMoveLedgerIds.length} with an illegal first move (ceiling ${FIRST_MOVE_CEILING}). Target is zero.`)

    for (const [bucket, records] of BUCKETS) {
      const inBucket = records.map(r => ANALYSIS.get(r.id))
      const ok = inBucket.filter(r => r.firstMove === 'ok').length
      const rest = tally(inBucket.filter(r => r.firstMove !== 'ok'), 'firstMove').map(([k, v]) => `${k}:${v}`).join(' ')
      lines.push(`${bucket}: ${records.length} records — ok:${ok} ${rest || '(none broken)'}`)
    }

    const causeOf = r => (r.firstMove === 'ok' ? r.line : r.firstMove)
    lines.push('\n--- ledger by cause ---')
    for (const [cause, count] of tally(broken.concat(lineOnly), causeOf)) lines.push(`  ${cause}: ${count}`)

    lines.push('\n--- ledger by variant ---')
    for (const [key, count] of tally(broken.concat(lineOnly), r => `${r.record.variantSlug}/${causeOf(r)}`)) {
      lines.push(`  ${key}: ${count}`)
    }

    if (skipped.length > 0) {
      const slugs = [...new Set(skipped.map(r => r.record.variantSlug))]
      lines.push(`\nskipped (engine cannot instantiate the variant): ${skipped.length} records across ${slugs.length} variants — ${slugs.join(', ')}`)
    } else {
      lines.push('\nskipped (engine cannot instantiate the variant): 0')
    }

    console.log(lines.join('\n'))
  })
})
