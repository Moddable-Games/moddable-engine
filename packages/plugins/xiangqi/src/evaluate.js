export function xiangqiEvaluate(state, playerIndex) {
  if (!state.board) return 0
  let score = 0

  const values = {
    general: 20000, chariot: 500, cannon: 350, horse: 300,
    advisor: 120, elephant: 120, soldier: 80,
  }

  // A board is an array on a grid and a map keyed by the topology's own cell
  // names elsewhere - hex writes "-5,5". Iterating the values covers both, and
  // material does not care where a piece stands.
  const cells = Array.isArray(state.board) ? state.board : Object.values(state.board)
  for (const piece of cells) {
    if (!piece) continue
    const value = values[piece.type] || 100
    if (piece.owner === playerIndex) score += value
    else score -= value
  }

  return score
}
