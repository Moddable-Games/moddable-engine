export const rifle = {
  key: 'rifle',

  moveFilter(moves) {
    return moves.filter(m => !(m.capture && m.promotion))
  },

  moveApply({ move, board, piece, setCell, getCell }) {
    const target = getCell(board, move.to)
    if (target || move.enPassant) {
      if (target) setCell(board, move.to, null)
      if (move.enPassant && move.captured !== undefined) setCell(board, move.captured, null)
    } else {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
    }
  },
}
