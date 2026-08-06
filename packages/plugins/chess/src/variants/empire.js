export const empire = {
  key: 'empire',

  winCondition(state, ctx) {
    const board = state.board
    const cols = 8
    let kingPos = -1, emperorPos = -1
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue
      if (board[i].type === 'king' && board[i].owner === 0) kingPos = i
      if (board[i].type === 'emperor' && board[i].owner === 1) emperorPos = i
    }
    if (kingPos === -1 || emperorPos === -1) return null
    const kingCol = kingPos % cols
    const emperorCol = emperorPos % cols
    if (kingCol !== emperorCol) return null
    const minRow = Math.min(Math.floor(kingPos / cols), Math.floor(emperorPos / cols))
    const maxRow = Math.max(Math.floor(kingPos / cols), Math.floor(emperorPos / cols))
    for (let r = minRow + 1; r < maxRow; r++) {
      if (board[r * cols + kingCol] !== null) return null
    }
    return 1 - ctx.currentPlayer
  },
}
