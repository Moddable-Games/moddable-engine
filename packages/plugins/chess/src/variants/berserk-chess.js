export const berserkChess = {
  key: 'berserkChess',
  slug: 'berserk',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck } = ctx
    if (movesThisTurn >= 2) return false
    return inCheck
  },
}
