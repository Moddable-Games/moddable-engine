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

export const fogOfWar = {
  key: 'fogOfWar',
  slug: 'fog-of-war',

  visibility(slice, viewerIndex, { topology, generateMovesForPiece, allPositions, getCell }) {
    const knowledge = new Map()
    for (const pos of allPositions()) {
      knowledge.set(pos, 'unknown')
    }
    for (const pos of allPositions()) {
      const cell = getCell(slice.board, pos)
      if (!cell || cell.owner !== viewerIndex) continue
      knowledge.set(pos, 'known')
      const moves = generateMovesForPiece(pos, slice, viewerIndex)
      for (const m of moves) {
        knowledge.set(m.to, 'known')
      }
    }
    return knowledge
  },

  winCondition: kingCaptureWin,
}
