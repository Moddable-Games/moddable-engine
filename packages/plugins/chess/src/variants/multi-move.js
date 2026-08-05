export const marseillais = {
  key: 'marseillais',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck, fullmoveNumber } = ctx
    if (fullmoveNumber === 1 && movesThisTurn === 1) return false
    if (inCheck) return false
    return movesThisTurn < 2
  },
}

export const monsterChess = {
  key: 'monsterChess',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck, playerIdx } = ctx
    const max = playerIdx === 0 ? 2 : 1
    if (inCheck) return false
    return movesThisTurn < max
  },
}

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

export const berserkChess = {
  key: 'berserkChess',

  turnLogic(ctx) {
    const { movesThisTurn, inCheck } = ctx
    if (movesThisTurn >= 2) return false
    return inCheck
  },
}
