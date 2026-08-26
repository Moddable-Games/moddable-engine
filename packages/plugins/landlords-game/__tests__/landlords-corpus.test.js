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

// Only the 1904 patent ruleset is modelled. The others need card decks or rules
// this does not carry, and each says so in its own frontmatter.
const PLAYABLE = ['1904-original']

describe('landlords corpus', () => {
  it.each(PLAYABLE)('%s: starts every player on MOTHER EARTH with $500', (slug) => {
    const slice = createGameForFamily('landlords-game', { variant: slug, rngSeed: 2 }).getState().slice
    expect(slice.cash.every(c => c === 500)).toBe(true)
    expect(new Set(slice.positions).size).toBe(1)
  })

  // Money is paid between players and into the Public Treasury; the only money
  // entering the game is wages and legacies, which come from the Wages box. A
  // rent that credits nobody, or a payment taken twice, breaks this.
  it.each(PLAYABLE)('%s: never loses or invents money', (slug) => {
    const game = createGameForFamily('landlords-game', { variant: slug, rngSeed: 2 })
    const start = game.getState().slice
    const opening = start.cash.reduce((a, b) => a + b, 0)
    let fromWagesBox = 0

    for (let ply = 0; ply < 400; ply++) {
      const before = game.getState().slice
      const moves = game.getLegalMoves()
      if (!moves.length) break
      game.applyMove(moves[ply % moves.length])
      const after = game.getState().slice

      // wages and legacies are the only external income
      const gained = after.cash.reduce((a, b) => a + b, 0) + after.treasury
        - (before.cash.reduce((a, b) => a + b, 0) + before.treasury)
      if (gained > 0) fromWagesBox += gained

      const held = after.cash.reduce((a, b) => a + b, 0) + after.treasury
      expect(held).toBe(opening + fromWagesBox)
      if (game.checkWin() !== null) break
    }
  })

  it.each(PLAYABLE)('%s: keeps every checker on a real space', (slug) => {
    const game = createGameForFamily('landlords-game', { variant: slug, rngSeed: 6 })
    const size = Object.keys(game.getState().slice.board).length
    for (let ply = 0; ply < 300; ply++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      game.applyMove(moves[ply % moves.length])
      for (const pos of game.getState().slice.positions) {
        expect(pos).toBeGreaterThanOrEqual(1)
        expect(pos).toBeLessThanOrEqual(size)
      }
      if (game.checkWin() !== null) break
    }
  })

  it.each(PLAYABLE)('%s: ends once every player has completed five circuits', (slug) => {
    for (const seed of [2, 5, 8]) {
      const game = createGameForFamily('landlords-game', { variant: slug, rngSeed: seed })
      let outcome = null
      let plies = 0
      for (; plies < 600; plies++) {
        const moves = game.getLegalMoves()
        if (!moves.length) break
        game.applyMove(moves[(plies * 3 + seed) % moves.length])
        const result = game.checkWin()
        if (result !== null && result !== undefined) { outcome = result; break }
      }
      expect(outcome).not.toBeNull()
      expect(game.getState().slice.circuits.every(c => c >= 5)).toBe(true)
    }
  })

  it('replays identically from the same seed', () => {
    const run = () => {
      const game = createGameForFamily('landlords-game', { variant: '1904-original', rngSeed: 4 })
      const trace = []
      for (let ply = 0; ply < 60; ply++) {
        const moves = game.getLegalMoves()
        if (!moves.length) break
        game.applyMove(moves[ply % moves.length])
        trace.push(game.getState().slice.positions.join('/'))
        if (game.checkWin() !== null) break
      }
      return trace.join(' ')
    }
    expect(run()).toBe(run())
  })
})
