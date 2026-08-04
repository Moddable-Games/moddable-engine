export const hexapawn = {
  key: 'hexapawn',

  winCondition(state, ctx) {
    const board = state.board
    for (let c = 0; c < 3; c++) {
      if (board[c] && board[c].type === 'pawn' && board[c].owner === 0) return 0
      if (board[6 + c] && board[6 + c].type === 'pawn' && board[6 + c].owner === 1) return 1
    }
    return null
  },
}
