import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { createGameForFamily, setRulesReader, registerPluginFactory } from '../../../play/src/play.js'
import '../../../play/src/bootstrap-plugins.js'
import { createMancalaPlugin } from '../index.js'

registerPluginFactory('mancala', createMancalaPlugin)

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

// Variants whose mechanics this plugin deliberately does not model. Declared by
// name rather than skipped silently, because a mancala variant played with the
// wrong capture rule looks like it works. Shrink-only: implementing one removes
// its entry, and nothing may be added without a decision.
const UNSUPPORTED = new Set([
  'bao',          // four rows and a separate stocking phase; a different game shape
])

const CONFIGURED = readdirSync(join(RULES_ROOT, 'mancala', 'content', 'variants'))
  .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  .filter(slug => !UNSUPPORTED.has(slug))

describe('mancala corpus', () => {
  // An it.each over an empty list is a pass that proves nothing.
  it('finds the variants', () => {
    expect(CONFIGURED.length).toBeGreaterThanOrEqual(6)
  })

  // The invariant every sowing game shares: seeds are moved, never created or
  // destroyed. A capture that forgets where the seeds went, a sow that
  // miscounts, or a relay that loops all show up here as a changed total.
  it.each(CONFIGURED)('%s: conserves every seed through a full game', (slug) => {
    const game = createGameForFamily('mancala', { variant: slug, rngSeed: 7 })
    const count = () => {
      const s = game.getState().slice
      return s.board.reduce((a, b) => a + b, 0) + (s.held || [0, 0]).reduce((a, b) => a + b, 0)
    }

    const opening = count()
    expect(opening).toBeGreaterThan(0)

    let plies = 0
    for (; plies < 600; plies++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      game.applyMove(moves[plies % moves.length])
      expect(count()).toBe(opening)
      const outcome = game.checkWin()
      if (outcome !== null && outcome !== undefined) break
    }

    // A game that never ends is as much a defect as one that loses seeds.
    expect(plies).toBeLessThan(600)
  })

  it.each(CONFIGURED)('%s: offers a legal move from the declared start', (slug) => {
    const game = createGameForFamily('mancala', { variant: slug, rngSeed: 1 })
    expect(game.getLegalMoves().length).toBeGreaterThan(0)
  })
})
