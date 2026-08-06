function kingCaptureWin(state) {
  const board = state.board
  let whiteKing = false, blackKing = false
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].type !== 'king') continue
    if (board[i].owner === 0) whiteKing = true
    else blackKing = true
  }
  if (!whiteKing) return 1
  if (!blackKing) return 0
  return null
}

export const duckChess = {
  key: 'duckChess',

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
