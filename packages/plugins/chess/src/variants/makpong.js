export const makpong = {
  key: 'makpong',

  moveFilter(moves, state, ctx) {
    if (!ctx.isInCheck()) return moves
    return moves.filter(m => {
      const piece = state.board[m.from]
      return piece && piece.type !== 'king'
    })
  },
}
