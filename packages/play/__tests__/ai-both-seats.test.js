/**
 * AI Both-Seats Guard
 *
 * For every registered variant across all families, the AI must return
 * a legal move when playing as EITHER seat. Tests both:
 *   - AI as first mover (seat 0): AI moves from the opening
 *   - AI as second mover (seat 1): human moves first, then AI responds
 *
 * This catches the class of bugs where the AI works as one seat but
 * fails as the other (Turkish IV, Go, seat-inversion issues).
 */
import { createGame, createAI, listVariants } from '../src/sdk.js'
import { getFamilies } from '../src/play.js'
import '../test-helpers/setup-rules-reader.js'
import '../../plugins/chess/index.js'
import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'
import '../../plugins/xiangqi/index.js'
import '../../plugins/shogi/index.js'

const AI_FAMILIES = ['chess', 'go', 'draughts', 'xiangqi', 'shogi']

const SKIP = new Set([
  'chess:duckChess',
  'chess:sittuyin',
  'chess:diceChess',
  'go:one-colour-go',
  'go:stoical-go',
])

for (const family of AI_FAMILIES) {
  const variants = listVariants(family)
  if (variants.length === 0) continue

  describe(`AI both seats: ${family}`, () => {
    for (const v of variants) {
      const variantKey = v.key || v
      const key = `${family}:${variantKey}`
      if (SKIP.has(key)) continue

      it(`${variantKey}: AI plays 5 plies as seat 0 (first mover)`, () => {
        const game = createGame(family, variantKey)
        const ai = createAI(family, variantKey, { difficulty: 'easy' })
        const names = game.raw.definition?.players?.names || ['white', 'black']

        for (let ply = 0; ply < 5; ply++) {
          const state = game.getState()
          const moves = game.getLegalMoves()
          if (moves.length === 0) break
          const idx = names.indexOf(game.raw.currentPlayer())
          const move = ai.pickMove(state.slice, idx)
          expect(move).not.toBeNull()
          expect(move).toBeDefined()
          const isLegal = moves.some(m => {
            if (m.coord !== undefined) return m.coord === move.coord
            if (m.action && !m.from) return m.action === move.action
            return m.from === move.from && m.to === move.to
          })
          expect(isLegal).toBe(true)
          game.applyMove(move)
        }
      })

      it(`${variantKey}: AI responds as seat 1 (second mover)`, () => {
        const game = createGame(family, variantKey)
        const ai = createAI(family, variantKey, { difficulty: 'easy' })
        const names = game.raw.definition?.players?.names || ['white', 'black']

        // Human (seat 0) completes their full turn (may be multiple moves)
        for (let i = 0; i < 10; i++) {
          const idx = names.indexOf(game.raw.currentPlayer())
          if (idx !== 0) break
          const moves = game.getLegalMoves()
          if (moves.length === 0) return
          game.applyMove(moves[0])
        }

        // AI (seat 1) must respond
        const idx = names.indexOf(game.raw.currentPlayer())
        if (idx !== 1) return
        const state = game.getState()
        const moves1 = game.getLegalMoves()
        if (moves1.length === 0) return
        const move = ai.pickMove(state.slice, 1)
        expect(move).not.toBeNull()
        expect(move).toBeDefined()
        const isLegal = moves1.some(m => {
          if (m.coord !== undefined) return m.coord === move.coord
          if (m.action && !m.from) return m.action === move.action
          return m.from === move.from && m.to === move.to
        })
        expect(isLegal).toBe(true)
      })
    }
  })
}
