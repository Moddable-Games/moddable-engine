/**
 * Guard: AI must never return null when legal moves exist.
 *
 * Fast mode (default, CI): one representative variant per family, 10 plies.
 * Full mode (AI_FULL_SWEEP=1): every registered variant, 10 plies.
 *
 * The property being verified: given legal moves exist, the AI always
 * returns one of them. A null return hangs the game.
 */
import { createGame, createAI, listVariants } from '../../play/src/sdk.js'
import { getFamilies } from '../../play/src/play.js'
import '../../play/test-helpers/setup-rules-reader.js'

const AI_FAMILIES = ['chess', 'go', 'draughts', 'xiangqi', 'shogi']

const SKIP_VARIANTS = new Set([
  'go:one-colour-go',
  'go:stoical-go',
  'chess:duckChess',
  'chess:sittuyin',
  'chess:diceChess',
  'chess:makpong',
])

// Selected for mechanism coverage, not name diversity:
//   grid: standard, antichess, english, xiangqi, shogi
//   hex topology: glinski
//   drops (from hand): crazyhouse
//   actions (custom moves): ouk-chaktrang (kingLeap)
//   multi-move turns: marseillais (2 moves per turn)
//   visibility/fog: fogOfWar (partial information)
//   large board: grand (10x10)
//   per-family: go, draughts, xiangqi, shogi each have at least one
const REPRESENTATIVE = {
  chess: ['standard', 'crazyhouse', 'glinski', 'ouk-chaktrang', 'marseillais', 'fogOfWar', 'grand'],
  go: ['standard', 'capture-go'],
  draughts: ['english', 'international'],
  xiangqi: ['standard'],
  shogi: ['standard'],
}

const FULL_SWEEP = process.env.AI_FULL_SWEEP === '1'

function variantsForFamily(family) {
  if (FULL_SWEEP) {
    return listVariants(family)
      .filter(v => !SKIP_VARIANTS.has(`${family}:${v.key || v}`))
  }
  return (REPRESENTATIVE[family] || []).map(key => ({ key }))
}

for (const family of AI_FAMILIES) {
  const variants = variantsForFamily(family)
  if (variants.length === 0) continue

  describe(`AI never-null: ${family}${FULL_SWEEP ? ' (full sweep)' : ''}`, () => {
    for (const v of variants) {
      const variantKey = v.key || v
      const key = `${family}:${variantKey}`
      if (SKIP_VARIANTS.has(key)) continue

      it(`${variantKey}: AI returns move from start`, () => {
        const game = createGame(family, variantKey)
        const moves = game.getLegalMoves()
        if (moves.length === 0) return

        const ai = createAI(family, variantKey, { difficulty: 'easy' })
        const state = game.getState()
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
