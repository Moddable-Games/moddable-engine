export function xiangqiEvaluate(state, playerIndex) {
  if (!state.board) return 0
  let score = 0

  const values = {
    general: 20000, chariot: 500, cannon: 350, horse: 300,
    advisor: 120, elephant: 120, soldier: 80,
  }

  for (const piece of state.board) {
    if (!piece) continue
    const value = values[piece.type] || 100
    if (piece.owner === playerIndex) score += value
    else score -= value
  }

  return score
}
