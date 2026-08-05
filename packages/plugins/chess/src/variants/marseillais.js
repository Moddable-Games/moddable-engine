export const marseillais = {
  key: 'marseillais',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck, fullmoveNumber } = ctx
    if (fullmoveNumber === 1 && movesThisTurn === 1) return false
    if (inCheck) return false
    return movesThisTurn < 2
  },
}
