const CENTER_SQUARES = [27, 28, 35, 36]

export const kingOfTheHill = {
  key: 'kingOfTheHill',
  label: 'King of the Hill',
  group: 'Tactical',
  title: 'King of the Hill',
  description: 'Standard rules, plus an instant win if your king reaches any of the four centre squares (d4, d5, e4, e5).',
  rule: 'Board: 8x8 · Win: Checkmate or king reaches centre',
  rows: 8,
  cols: 8,

  winCondition(state, ctx) {
    const board = state.board
    for (const sq of CENTER_SQUARES) {
      const piece = board[sq]
      if (piece && piece.type === 'king') {
        return piece.owner === 0 ? 'white' : 'black'
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

  openingBook: {
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4'],
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': ['e7e5', 'd7d5'],
  },
}
