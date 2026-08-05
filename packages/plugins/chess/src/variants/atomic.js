export const atomic = {
  key: 'atomic',

  moveApply({ move, board, piece, playerIdx, topology, setCell, getCell }) {
    const target = getCell(board, move.to)
    if (target && !move.enPassant) {
      setCell(board, move.to, null)
      setCell(board, move.from, null)
      const cols = topology ? topology.cols : 8
      const rows = board.length / cols
      const r = Math.floor(move.to / cols), c = move.to % cols
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
          const sq = nr * cols + nc
          const p = getCell(board, sq)
          if (p && p.type !== 'pawn') setCell(board, sq, null)
        }
      }
    } else if (move.enPassant) {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
      if (move.captured !== undefined) setCell(board, move.captured, null)
    } else {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
    }
  },

  winCondition(state, ctx) {
    const board = state.board
    let whiteKing = false, blackKing = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].type === 'king') {
        if (board[i].owner === 0) whiteKing = true
        else blackKing = true
      }
    }
    if (!whiteKing && !blackKing) return 'draw'
    if (!whiteKing) return 1
    if (!blackKing) return 0
    return null
  },
}
