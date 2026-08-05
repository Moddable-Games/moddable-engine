export const progressiveItalian = {
  key: 'progressive-italian',

  turnLogic(ctx) {
    const { movesThisTurn, slice } = ctx
    const target = slice._progressiveTarget || 1
    return movesThisTurn < target
  },

  moveFilter(moves, state, { givesCheck }) {
    const target = state._progressiveTarget || 1
    const current = (state._movesThisTurn || 0) + 1
    if (current >= target) return moves
    return moves.filter(m => !givesCheck(m))
  },

  onTurnEnd(slice) {
    slice._progressiveTarget = (slice._progressiveTarget || 1) + 1
  },
}
