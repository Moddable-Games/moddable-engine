export const omnicide = {
  key: 'omnicide',

  winCondition(state, ctx) {
    const board = state.board
    const opponent = 1 - ctx.currentPlayer
    let hasPiece = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === opponent) { hasPiece = true; break }
    }
    if (!hasPiece) return opponent
    return null
  },
}
