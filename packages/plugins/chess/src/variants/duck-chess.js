import { kingCaptureWin } from '../variant-helpers.js'

export const duckChess = {
  key: 'duckChess',
  slug: 'duck-chess',

  moveFilter(moves, state) {
    if (state._blockerPhase) {
      return moves.filter(m => m.action === 'blocker')
    }
    const blockerSq = state._blockerSq
    if (blockerSq !== undefined && blockerSq >= 0) {
      return moves.filter(m => m.action || m.to !== blockerSq)
    }
    return moves
  },

  turnLogic(ctx) {
    if (!ctx.slice._blockerPhase) {
      ctx.slice._blockerPhase = true
      return true
    }
    return false
  },

  actions: {
    blocker: {
      skipsCheckFilter: true,
      continuesTurn: false,
      generate(slice, playerIdx, { allPositions, getCell }) {
        if (!slice._blockerPhase) return []
        const moves = []
        for (const pos of allPositions()) {
          if (getCell(slice.board, pos) === null) {
            moves.push({ action: 'blocker', to: pos })
          }
        }
        return moves
      },
      apply(move, { board, slice }) {
        const prev = slice._blockerSq
        if (prev !== undefined && prev >= 0) board[prev] = null
        board[move.to] = { type: 'blocker', owner: -1 }
        return { board, sliceKeys: { _blockerSq: move.to, _blockerPhase: false } }
      },
    },
  },

  winCondition: kingCaptureWin,
}
