export const khansChess = {
  key: 'khans-chess',

  winCondition(state, ctx) {
    const board = state.board
    const cols = 8
    const rows = 8
    for (let c = 0; c < cols; c++) {
      const topCell = board[c]
      if (topCell && topCell.type === 'king' && topCell.owner === 0) return 0
      const botCell = board[(rows - 1) * cols + c]
      if (botCell && botCell.type === 'king' && botCell.owner === 1) return 1
    }
    return null
  },
}
