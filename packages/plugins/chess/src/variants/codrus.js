export const codrus = {
  key: 'codrus',

  winCondition(state, ctx) {
    const board = state.board
    let whiteKing = false, blackKing = false
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].type !== 'king') continue
      if (board[i].owner === 0) whiteKing = true
      else blackKing = true
    }
    if (!whiteKing) return 0
    if (!blackKing) return 1
    return null
  },
}
