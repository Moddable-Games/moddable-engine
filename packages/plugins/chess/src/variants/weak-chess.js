export const weakChess = {
  key: 'weakChess',
  slug: 'weak',

  moveFilter(moves, state, ctx) {
    const STRENGTH = { pawn: 1, knight: 2, bishop: 3, rook: 4, queen: 5, king: 6 }
    const board = state.board
    let minStrength = 7
    for (const m of moves) {
      const piece = board[m.from]
      const s = piece ? (STRENGTH[piece.type] || 6) : 6
      if (s < minStrength) minStrength = s
    }
    return moves.filter(m => {
      const piece = board[m.from]
      return (piece ? (STRENGTH[piece.type] || 6) : 6) === minStrength
    })
  },
}
