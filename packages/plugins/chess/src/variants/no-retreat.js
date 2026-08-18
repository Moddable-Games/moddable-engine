export const noRetreat = {
  key: 'noRetreat',
  slug: 'no-retreat',

  moveFilter(moves, state, ctx) {
    const cols = 8
    return moves.filter(m => {
      const fromRow = Math.floor(m.from / cols)
      const toRow = Math.floor(m.to / cols)
      const piece = state.board[m.from]
      if (!piece) return true
      if (piece.owner === 0) return toRow <= fromRow
      return toRow >= fromRow
    })
  },
}
