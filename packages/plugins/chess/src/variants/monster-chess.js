export const monsterChess = {
  key: 'monsterChess',
  slug: 'monster-chess',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck, playerIdx } = ctx
    const max = playerIdx === 0 ? 2 : 1
    if (inCheck) return false
    return movesThisTurn < max
  },
}
