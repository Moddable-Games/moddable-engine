/**
 * AI continueTurn Guard
 *
 * Variants where a player gets multiple moves per turn (marseillais,
 * progressive, monsterChess). The AI must return a legal move at
 * every point in a multi-move turn, for both seats.
 *
 * Uses game.raw.currentPlayer() to determine whose turn it is,
 * rather than assuming strict alternation.
 */
import { createGame, createAI } from '../src/sdk.js'
import '../test-helpers/setup-rules-reader.js'
import '../../plugins/chess/index.js'

const CONTINUE_TURN_VARIANTS = [
  { key: 'marseillais', plies: 12 },
  { key: 'progressive', plies: 12 },
  { key: 'progressive-italian', plies: 12 },
  { key: 'monsterChess', plies: 10 },
]

function isMoveLegal(move, legalMoves) {
  return legalMoves.some(m => {
    if (m.coord !== undefined) return m.coord === move.coord
    if (m.action && !m.from) return m.action === move.action
    return m.from === move.from && m.to === move.to
  })
}

function playerIndex(game) {
  const names = game.raw.definition?.players?.names || ['white', 'black']
  return names.indexOf(game.raw.currentPlayer())
}

describe('AI continueTurn: multi-move turns', () => {
  for (const { key: variant, plies } of CONTINUE_TURN_VARIANTS) {
    it(`${variant}: AI plays ${plies} plies as seat 0`, () => {
      const game = createGame('chess', variant)
      const ai = createAI('chess', variant, { difficulty: 'easy' })

      for (let ply = 0; ply < plies; ply++) {
        const moves = game.getLegalMoves()
        if (moves.length === 0) break

        const idx = playerIndex(game)
        const state = game.getState()
        const move = ai.pickMove(state.slice, idx)

        expect(move).not.toBeNull()
        expect(move).toBeDefined()
        expect(isMoveLegal(move, moves)).toBe(true)

        game.applyMove(move)
      }
    })

    it(`${variant}: AI responds as seat 1 after human's first move`, () => {
      const game = createGame('chess', variant)
      const ai = createAI('chess', variant, { difficulty: 'easy' })

      // Human (seat 0) makes first move
      const moves0 = game.getLegalMoves()
      if (moves0.length === 0) return
      game.applyMove(moves0[0])

      // Now play several plies — AI should handle seat 1's turn(s)
      for (let ply = 0; ply < 8; ply++) {
        const moves = game.getLegalMoves()
        if (moves.length === 0) break

        const idx = playerIndex(game)
        const state = game.getState()
        const move = ai.pickMove(state.slice, idx)

        expect(move).not.toBeNull()
        expect(move).toBeDefined()
        expect(isMoveLegal(move, moves)).toBe(true)

        game.applyMove(move)
      }
    })
  }
})
