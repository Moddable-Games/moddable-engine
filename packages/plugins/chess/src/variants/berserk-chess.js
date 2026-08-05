export const berserkChess = {
  key: 'berserkChess',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck } = ctx
    if (movesThisTurn >= 2) return false
    return inCheck
  },
}
