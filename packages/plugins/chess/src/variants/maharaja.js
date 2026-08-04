export const maharaja = {
  key: 'maharaja',

  winCondition(state, ctx) {
    const board = state.board
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].type === 'amazon' && board[i].owner === 0) return null
    }
    return 1
  },
}
