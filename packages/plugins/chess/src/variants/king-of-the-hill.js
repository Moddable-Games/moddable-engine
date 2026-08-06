const CENTER_SQUARES = [27, 28, 35, 36]

export const kingOfTheHill = {
  key: 'kingOfTheHill',

  winCondition(state, ctx) {
    const board = state.board
    for (const sq of CENTER_SQUARES) {
      const piece = board[sq]
      if (piece && piece.type === 'king') {
        return piece.owner
      }
    }
    return null
  },

  evaluate(state, ctx) {
    const board = state.board
    const cols = 8
    let score = 0
    for (let i = 0; i < board.length; i++) {
      const piece = board[i]
      if (!piece || piece.type !== 'king') continue
      const row = Math.floor(i / cols)
      const col = i % cols
      const distR = Math.abs(row - 3.5)
      const distC = Math.abs(col - 3.5)
      const dist = distR + distC
      const bonus = (7 - dist) * 150
      if (piece.owner === ctx.currentPlayer) score += bonus
      else score -= bonus
    }
    return score
  },

}
