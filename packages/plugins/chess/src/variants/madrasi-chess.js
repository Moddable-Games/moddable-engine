import { pieceAttacksSquare } from '../variant-helpers.js'

export const madrasiChess = {
  key: 'madrasiChess',
  slug: 'madrasi',

  moveFilter(moves, state, ctx) {
    const board = state.board
    const cols = 8
    const rows = board.length / cols
    return moves.filter(m => {
      const piece = board[m.from]
      if (!piece || piece.type === 'king') return true
      const enemy = 1 - piece.owner
      for (let i = 0; i < board.length; i++) {
        if (!board[i] || board[i].owner !== enemy || board[i].type !== piece.type) continue
        if (pieceAttacksSquare(board[i], i, m.from, board, cols, rows)) return false
      }
      return true
    })
  },
}
