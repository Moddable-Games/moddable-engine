export function reversiEvaluate(state, playerIndex) {
  if (!state.board) return 0
  const board = state.board
  const size = Math.round(Math.sqrt(board.length))
  let score = 0

  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) continue
    const row = Math.floor(i / size)
    const col = i % size
    let weight = 100

    const isCorner = (row === 0 || row === size - 1) && (col === 0 || col === size - 1)
    const isEdge = row === 0 || row === size - 1 || col === 0 || col === size - 1
    const isXSquare = (row === 1 || row === size - 2) && (col === 1 || col === size - 2)

    if (isCorner) weight = 2500
    else if (isXSquare) weight = -500
    else if (isEdge) weight = 500

    const owner = typeof board[i] === 'object' ? board[i].owner : board[i]
    if (owner === playerIndex) {
      score += weight
    } else {
      score -= weight
    }
  }

  return score
}
