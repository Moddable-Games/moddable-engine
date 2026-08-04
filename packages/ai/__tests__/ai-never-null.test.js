/**
 * Guard: AI must never return null when legal moves exist.
 *
 * For every registered variant, the AI must return a move:
 *   1. From the starting position
 *   2. After one human move has been applied
 *
 * Condition 2 is what Turkish Great Chess IV fails — the opening book
 * provides move 1 but the search times out on 14×14 without completing
 * a single iteration, returning null.
 */
import { createGame, createAI, listVariants } from '../../play/src/sdk.js'
import { getFamilies } from '../../play/src/play.js'
import '../../play/test-helpers/setup-rules-reader.js'
import '../../plugins/chess/index.js'
import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'
import '../../plugins/xiangqi/index.js'
import '../../plugins/shogi/index.js'

const AI_FAMILIES = ['chess', 'go', 'draughts', 'xiangqi', 'shogi']

const SKIP_VARIANTS = new Set([
  'go:one-colour-go',
  'go:stoical-go',
  'chess:duckChess',
  'chess:sittuyin',
])

for (const family of AI_FAMILIES) {
  const variants = listVariants(family)
  if (variants.length === 0) continue

  describe(`AI never-null: ${family}`, () => {
    for (const v of variants) {
      const key = `${family}:${v.key || v}`
      if (SKIP_VARIANTS.has(key)) continue

      const variantKey = v.key || v

      it(`${variantKey}: AI returns move from start`, () => {
        const game = createGame(family, variantKey)
        const state = game.getState()
        const moves = game.getLegalMoves()
        if (moves.length === 0) return

        const ai = createAI(family, variantKey, { difficulty: 'easy' })
        const move = ai.pickMove(state.slice, 0)
        expect(move).not.toBeNull()
        expect(move).toBeDefined()
      })

      it(`${variantKey}: AI returns move for 10 alternating plies`, () => {
        const game = createGame(family, variantKey)
        const ai = createAI(family, variantKey, { difficulty: 'easy' })

        for (let ply = 0; ply < 10; ply++) {
          const state = game.getState()
          const moves = game.getLegalMoves()
          if (moves.length === 0) break

          const playerIdx = ply % 2
          const move = ai.pickMove(state.slice, playerIdx)
          expect(move).not.toBeNull()
          expect(move).toBeDefined()
          game.applyMove(move)
        }
      })
    }
  })
}
