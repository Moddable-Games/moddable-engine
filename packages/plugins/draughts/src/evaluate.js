export function draughtsEvaluate(state, playerIndex) {
  if (!state.board) return 0
  let score = 0
  const board = state.board
  const cols = state._cols || 8
  const rows = board.length / cols

  for (let i = 0; i < board.length; i++) {
    const piece = board[i]
    if (!piece) continue
    const row = Math.floor(i / cols)
    const value = piece.type === 'king' ? 300 : 100
    const advancement = piece.owner === 0
      ? (rows - 1 - row) * 5
      : row * 5

    if (piece.owner === playerIndex) {
      score += value + advancement
    } else {
      score -= value + advancement
    }
  }

  return score
}
