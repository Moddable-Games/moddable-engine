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

const VARIANTS = readdirSync(join(RULES_ROOT, 'morris', 'content', 'variants'))
  .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))

// The board each variant should be playing on, from its own rules text. A
// generated board that quietly comes out the wrong size would still play, so
// the sizes are asserted rather than inferred.
const BOARDS = {
  'nine-mens-morris': { points: 24, mills: 16 },
  'lasker-morris': { points: 24, mills: 16 },
  'shax': { points: 24, mills: 16 },
  'twelve-mens-morris': { points: 24, mills: 20 },
  'morabaraba': { points: 24, mills: 20 },
  'six-mens-morris': { points: 16, mills: 8 },
  'three-mens-morris': { points: 9, mills: 6 },
}

describe('morris corpus', () => {
  it('finds every variant', () => {
    expect(VARIANTS.length).toBe(7)
    expect(Object.keys(BOARDS).sort()).toEqual([...VARIANTS].sort())
  })

  it.each(VARIANTS)('%s: builds the board its rules describe', (slug) => {
    const game = createGameForFamily('morris', { variant: slug, rngSeed: 1 })
    const slice = game.getState().slice
    expect(Object.keys(slice.board)).toHaveLength(BOARDS[slug].points)
    expect(slice._mills).toHaveLength(BOARDS[slug].mills)
  })

  it.each(VARIANTS)('%s: every mill is three distinct points that exist', (slug) => {
    const slice = createGameForFamily('morris', { variant: slug, rngSeed: 1 }).getState().slice
    for (const mill of slice._mills) {
      expect(new Set(mill).size).toBe(3)
      for (const node of mill) expect(slice.board).toHaveProperty(node)
    }
  })

  // Pieces are placed, moved and removed; they are never created. A miscounted
  // placement, a removal that forgets to clear the point, or a move that
  // duplicates a piece all show up as a broken total.
  it.each(VARIANTS)('%s: never holds more pieces than were placed', (slug) => {
    const game = createGameForFamily('morris', { variant: slug, rngSeed: 3 })
    for (let ply = 0; ply < 400; ply++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      game.applyMove(moves[(ply * 7 + 3) % moves.length])
      const s = game.getState().slice
      for (const player of [0, 1]) {
        const onBoard = Object.values(s.board).filter(v => v === player).length
        expect(onBoard).toBeLessThanOrEqual(s.placed[player])
      }
      if (game.checkWin() !== null) break
    }
  })

  it.each(VARIANTS)('%s: reaches a result rather than running forever', (slug) => {
    for (const seed of [1, 5, 9]) {
      const game = createGameForFamily('morris', { variant: slug, rngSeed: seed })
      let outcome = null
      let plies = 0
      for (; plies < 600; plies++) {
        const moves = game.getLegalMoves()
        if (!moves.length) break
        game.applyMove(moves[(plies * 7 + seed) % moves.length])
        const result = game.checkWin()
        if (result !== null && result !== undefined) { outcome = result; break }
      }
      expect(plies).toBeLessThan(600)
      expect(outcome).not.toBeNull()
    }
  })
})
