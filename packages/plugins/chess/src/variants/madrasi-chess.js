export const madrasiChess = {
  key: 'madrasiChess',

  moveFilter(moves, state, ctx) {
    const board = state.board
    const cols = 8
    const rows = board.length / cols
    return moves.filter(m => {
      const piece = board[m.from]
      if (!piece || piece.type === 'king') return true
      const enemy = 1 - piece.owner
      for (let i = 0; i < board.length; i++) {
        if (!board[i] || board[i].owner !== enemy || board[i].type !== piece.type) continue
        if (pieceAttacksSquare(board[i], i, m.from, board, cols, rows)) return false
      }
      return true
    })
  },
}

function pieceAttacksSquare(piece, from, target, board, cols, rows) {
  const fr = Math.floor(from / cols), fc = from % cols
  const tr = Math.floor(target / cols), tc = target % cols
  const dr = tr - fr, dc = tc - fc
  switch (piece.type) {
    case 'king': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1
    case 'knight': return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)
    case 'rook': return (dr === 0 || dc === 0) && pathIsClear(from, target, board, cols)
    case 'bishop': return Math.abs(dr) === Math.abs(dc) && dr !== 0 && pathIsClear(from, target, board, cols)
    case 'queen': return ((dr === 0 || dc === 0) || (Math.abs(dr) === Math.abs(dc) && dr !== 0)) && pathIsClear(from, target, board, cols)
    case 'pawn': { const dir = piece.owner === 0 ? -1 : 1; return dr === dir && Math.abs(dc) === 1 }
    default: return false
  }
}

function pathIsClear(from, target, board, cols) {
  const fr = Math.floor(from / cols), fc = from % cols
  const tr = Math.floor(target / cols), tc = target % cols
  const dr = tr - fr, dc = tc - fc
  const stepR = dr === 0 ? 0 : dr / Math.abs(dr)
  const stepC = dc === 0 ? 0 : dc / Math.abs(dc)
  let r = fr + stepR, c = fc + stepC
  while (r !== tr || c !== tc) {
    if (board[r * cols + c]) return false
    r += stepR; c += stepC
  }
  return true
}
