/**
 * Guard: AI at expert difficulty must never repeat a position within 10 plies.
 * Repetition at expert is always a flat evaluation — the search sees no reason
 * to make progress, so it shuffles pieces back and forth.
 */
import { createGame, createAI } from '../../play/src/sdk.js'
import '../../play/test-helpers/setup-rules-reader.js'
import '../../plugins/chess/index.js'
import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'
import '../../plugins/xiangqi/index.js'
import '../../plugins/shogi/index.js'

const CASES = [
  ['chess', 'standard'],
  ['chess', 'grand'],
  ['chess', 'turkish-great-chess-iv'],
  ['chess', 'capablanca'],
  ['xiangqi', 'standard'],
  ['shogi', 'standard'],
  ['draughts', 'international'],
  ['go', 'atari-go'],
]

describe('AI no-repetition guard', () => {
  for (const [family, variantKey] of CASES) {
    it(`${family}/${variantKey}: no repeated position in 10 plies at expert`, () => {
      const game = createGame(family, variantKey)
      const ai = createAI(family, variantKey, { difficulty: 'expert' })
      const seen = new Set()

      for (let ply = 0; ply < 10; ply++) {
        const state = game.getState()
        const moves = game.getLegalMoves()
        if (moves.length === 0) break

        const posKey = JSON.stringify(state.slice)
        if (seen.has(posKey)) {
          throw new Error(`Position repeated at ply ${ply}: ${posKey.slice(0, 80)}...`)
        }
        seen.add(posKey)

        const playerIdx = ply % 2
        const move = ai.pickMove(state.slice, playerIdx)
        if (!move) break
        game.applyMove(move)
      }
    }, 60000)
  }
})
