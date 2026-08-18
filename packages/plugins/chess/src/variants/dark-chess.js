function kingCaptureWin(state) {
  const board = state.board
  let whiteKing = false, blackKing = false
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].type !== 'king') continue
    if (board[i].owner === 0) whiteKing = true
    else blackKing = true
  }
  if (!whiteKing) return 1
  if (!blackKing) return 0
  return null
}

export const darkChess = {
  key: 'darkChess',
  slug: 'dark-chess',

  visibility(slice, viewerIndex, { allPositions, getCell }) {
    const knowledge = new Map()
    for (const pos of allPositions()) {
      const cell = getCell(slice.board, pos)
      if (cell && cell.owner === viewerIndex) {
        knowledge.set(pos, 'known')
      } else {
        knowledge.set(pos, 'unknown')
      }
    }
    return knowledge
  },

  winCondition: kingCaptureWin,
}
