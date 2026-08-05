export const breakthrough = {
  key: 'breakthrough',

  winCondition(state, ctx) {
    const board = state.board
    const size = board.length
    const cols = ctx.config?.cols || Math.round(Math.sqrt(size))
    const rows = size / cols
    for (let c = 0; c < cols; c++) {
      const topPiece = board[c]
      if (topPiece && topPiece.type === 'pawn' && topPiece.owner === 0) return 0
      const botPiece = board[(rows - 1) * cols + c]
      if (botPiece && botPiece.type === 'pawn' && botPiece.owner === 1) return 1
    }
    return null
  },
}
