import { pieceAttacksSquare } from '../variant-helpers.js'

export const patrolChess = {
  key: 'patrolChess',
  slug: 'patrol',

  moveFilter(moves, state, ctx) {
    const board = state.board
    const cols = 8
    return moves.filter(m => {
      const target = board[m.to]
      const isCapture = (target !== null && target !== undefined) || m.enPassant
      if (!isCapture) return true
      return isPatrolled(board, m.from, ctx.currentPlayer, cols)
    })
  },
}

function isPatrolled(board, sq, owner, cols) {
  const rows = board.length / cols
  const r = Math.floor(sq / cols), c = sq % cols
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].owner !== owner || i === sq) continue
    if (pieceAttacksSquare(board[i], i, sq, board, cols, rows)) return true
  }
  return false
}
