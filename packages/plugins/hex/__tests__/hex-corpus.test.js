import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { createGameForFamily, setRulesReader } from '../../../play/src/play.js'
import '../../../play/src/bootstrap-plugins.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
setRulesReader(
  (family, slug) => readFileSync(slug === 'rulebook'
    ? join(RULES_ROOT, family, 'content', 'rulebook.md')
    : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`), 'utf8'),
  (family) => {
    try {
      return readdirSync(join(RULES_ROOT, family, 'content', 'variants'))
        .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
    } catch { return [] }
  },
)

const VARIANTS = readdirSync(join(RULES_ROOT, 'hex', 'content', 'variants'))
  .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))

// The board each variant should have, from its own frontmatter. A generated
// board that comes out the wrong size still plays, so the sizes are asserted.
const BOARDS = {
  '9x9': { cells: 81, edges: 4 },
  'standard': { cells: 121, edges: 4 },
  '13x13': { cells: 169, edges: 4 },
  '14x14': { cells: 196, edges: 4 },
  '19x19': { cells: 361, edges: 4 },
  'y-small': { cells: 45, edges: 3 },
  'y-game': { cells: 78, edges: 3 },
  'y-large': { cells: 120, edges: 3 },
}

describe('hex corpus', () => {
  it('finds every variant', () => {
    expect(VARIANTS).toHaveLength(8)
    expect(Object.keys(BOARDS).sort()).toEqual([...VARIANTS].sort())
  })

  it.each(VARIANTS)('%s: builds the board its frontmatter declares', (slug) => {
    const slice = createGameForFamily('hex', { variant: slug, rngSeed: 1 }).getState().slice
    expect(Object.keys(slice.board)).toHaveLength(BOARDS[slug].cells)
    expect(slice._edges).toHaveLength(BOARDS[slug].edges)
  })

  it.each(VARIANTS)('%s: offers every empty cell and nothing else', (slug) => {
    const game = createGameForFamily('hex', { variant: slug, rngSeed: 1 })
    expect(game.getLegalMoves()).toHaveLength(BOARDS[slug].cells)
    game.applyMove(game.getLegalMoves()[0])
    expect(game.getLegalMoves()).toHaveLength(BOARDS[slug].cells - 1)
  })

  // Neither game can be drawn, so play must always reach a winner and can never
  // run out of moves first. A board that fills without a winner would mean the
  // adjacency or the edge sets are wrong.
  it.each(VARIANTS)('%s: always reaches a winner, never a full board', (slug) => {
    for (const seed of [1, 4, 7]) {
      const game = createGameForFamily('hex', { variant: slug, rngSeed: seed })
      const total = Object.keys(game.getState().slice.board).length
      let outcome = null
      let plies = 0
      for (; plies <= total; plies++) {
        const moves = game.getLegalMoves()
        if (!moves.length) break
        game.applyMove(moves[(plies * 13 + seed) % moves.length])
        const result = game.checkWin()
        if (result !== null && result !== undefined) { outcome = result; break }
      }
      expect(outcome).not.toBeNull()
      expect(plies).toBeLessThanOrEqual(total)
    }
  })
})
