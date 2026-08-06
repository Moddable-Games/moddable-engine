export const progressive = {
  key: 'progressive',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck, slice } = ctx
    if (inCheck) return false
    const target = slice._progressiveTarget || 1
    return movesThisTurn < target
  },

  onTurnEnd(slice) {
    slice._progressiveTarget = (slice._progressiveTarget || 1) + 1
  },
}
