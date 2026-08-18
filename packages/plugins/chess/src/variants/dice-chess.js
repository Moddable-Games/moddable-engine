import { createRng } from '../../../../core/src/rng.js'
import { createStandardDice } from '../../../../component-dice/src/standard-dice.js'

const DICE_TYPES = [null, 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
const dicePair = createStandardDice({ count: 2, faces: 6 })

export const diceChess = {
  key: 'diceChess',
  slug: 'dice-chess',

  moveFilter(moves, state) {
    const seed = (state.halfmoveClock || 0) * 97 + (state.fullmoveNumber || 1) * 31 + 7
    const rng = createRng(seed)
    const roll = dicePair.roll(rng)
    if (roll[0] === roll[1]) return moves
    const allowed = new Set([DICE_TYPES[roll[0]], DICE_TYPES[roll[1]]])
    const filtered = moves.filter(m => {
      if (m.action === 'drop') return false
      const piece = state.board[m.from]
      return piece && allowed.has(piece.type)
    })
    return filtered
  },
}
