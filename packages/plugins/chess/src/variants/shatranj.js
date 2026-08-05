const bareKingWin = (state) => {
  const board = state.board
  let wCount = 0, bCount = 0, wKing = false, bKing = false
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue
    if (board[i].owner === 0) { wCount++; if (board[i].type === 'king') wKing = true }
    else { bCount++; if (board[i].type === 'king') bKing = true }
  }
  if (!wKing) return 1
  if (!bKing) return 0
  if (wCount === 1 && wKing) return 1
  if (bCount === 1 && bKing) return 0
  return null
}

export const shatranj = {
  key: 'shatranj',
  winCondition: bareKingWin,
}
