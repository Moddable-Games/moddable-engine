export function shogiEvaluate(state, playerIndex) {
  if (!state.board) return 0
  let score = 0

  const values = {
    king: 20000, rook: 500, bishop: 400, gold: 300, silver: 250,
    knight: 200, lance: 180, pawn: 80,
    promoted_rook: 600, promoted_bishop: 500,
    promoted_silver: 310, promoted_knight: 310,
    promoted_lance: 310, promoted_pawn: 310,
  }

  for (const piece of state.board) {
    if (!piece) continue
    const value = values[piece.type] || 100
    if (piece.owner === playerIndex) score += value
    else score -= value
  }

  const myHand = state.hands?.[playerIndex] || []
  for (const type of myHand) score += Math.round((values[type] || 100) * 0.8)
  if (state.hands) {
    for (let i = 0; i < state.hands.length; i++) {
      if (i === playerIndex) continue
      for (const type of state.hands[i] || []) score -= Math.round((values[type] || 100) * 0.8)
    }
  }

  return score
}
