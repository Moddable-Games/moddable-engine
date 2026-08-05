export const extinction = {
  key: 'extinction',

  winCondition(state, ctx) {
    const board = state.board
    const types = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
    for (const player of [0, 1]) {
      const has = {}
      for (const t of types) has[t] = false
      for (let i = 0; i < board.length; i++) {
        if (board[i] && board[i].owner === player) has[board[i].type] = true
      }
      for (const t of types) {
        if (!has[t]) return 1 - player
      }
    }
    return null
  },
}
