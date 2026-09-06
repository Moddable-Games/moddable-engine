/**
 * engine#158 asked for a sweep: `romanchenkos-chess` was reported placing six
 * pieces on void squares and generating moves into them. It does not - that
 * entry was already stale - but the sweep it prompted found two variants that
 * do, and both were marked playable:
 *
 *   vierschach          castled queenside onto a corner outside its board
 *   four-player-shogi   dropped into the corners; 324 such moves in 150 plies,
 *                       three pieces left standing there
 *
 * Both were the same mistake made twice: a hole in the board is stored as an
 * empty square, so anything that walks the board array by index, or checks a
 * path for emptiness, reads a void as somewhere a piece may go. The topology
 * knows better and neither caller asked it.
 *
 * So this is written by shape rather than by name. It discovers every variant
 * in the corpus that declares `topology.voids` and plays it, which is what a
 * named list of the two known offenders could never do.
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createGameForFamily } from '../src/play.js'
import { createRng } from '../../core/index.js'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'
import '../test-helpers/setup-rules-reader.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR
  || join(process.cwd(), '..', 'moddable-rules', 'games')

const PLIES = 150
const SEED = 7

function metaOf(path) {
  try { return parseFrontmatter(readFileSync(path, 'utf8')).meta } catch { return null }
}

// Every variant whose frontmatter declares holes in a grid, whatever family it
// belongs to. A variant added tomorrow is covered without editing this file.
function variantsWithVoids() {
  const out = []
  let families = []
  try {
    families = readdirSync(RULES_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(f => existsSync(join(RULES_ROOT, f, 'content', 'variants')))
  } catch { return out }

  for (const family of families) {
    const dir = join(RULES_ROOT, family, 'content', 'variants')
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const slug = file.replace(/\.md$/, '')
      const meta = metaOf(join(dir, file))
      const topo = meta?.engine?.topology
      if (!topo || !Array.isArray(topo.voids) || !topo.voids.length || !topo.cols) continue
      out.push({ family, slug, cols: topo.cols, voids: topo.voids })
    }
  }
  return out
}

const WITH_VOIDS = variantsWithVoids()

// Only families with a plugin can be played; the rest declare voids for the
// renderer alone and there is nothing here to exercise.
const PLAYABLE_FAMILIES = new Set(['chess', 'shogi', 'draughts', 'go', 'xiangqi', 'reversi', 'morris'])
const CASES = WITH_VOIDS.filter(v => PLAYABLE_FAMILIES.has(v.family))

describe('voids are honoured across the corpus (engine#158)', () => {
  // A sweep that swept nothing passes. Assert it read the corpus first.
  it('finds the variants that declare voids', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(10)
  })

  describe.each(CASES.map(c => [`${c.family}/${c.slug}`, c]))('%s', (_name, testCase) => {
    const voidIndex = new Set(testCase.voids.map(([r, c]) => r * testCase.cols + c))
    const describeCell = (i) => `${i} (r${Math.trunc(i / testCase.cols)},c${i % testCase.cols})`

    it('never puts a piece on a void, and never offers a move through one', () => {
      const game = createGameForFamily(testCase.family, { variant: testCase.slug, rngSeed: SEED })
      const board = () => {
        const state = game.getState()
        return (state?.slice || state)?.board
      }

      const start = board()
      expect(Array.isArray(start)).toBe(true)
      const startOnVoid = start
        .map((cell, i) => (cell && voidIndex.has(i) ? describeCell(i) : null))
        .filter(Boolean)
      expect(startOnVoid).toEqual([])

      const rng = createRng(SEED)
      const offered = new Set()
      let plies = 0
      while (plies < PLIES) {
        const moves = game.getLegalMoves()
        if (!moves.length) break
        for (const move of moves) {
          if (move.to !== undefined && voidIndex.has(move.to)) offered.add(`to ${describeCell(move.to)}`)
          if (move.from !== undefined && voidIndex.has(move.from)) offered.add(`from ${describeCell(move.from)}`)
        }
        const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
        if (!result || !result.ok) break
        plies++
        if (result.winner) break
      }
      expect([...offered]).toEqual([])

      const endOnVoid = board()
        .map((cell, i) => (cell && voidIndex.has(i) ? describeCell(i) : null))
        .filter(Boolean)
      expect(endOnVoid).toEqual([])
    })
  })
})
