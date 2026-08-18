export const gridChess = {
  key: 'gridChess',
  slug: 'grid-chess',

  moveFilter(moves, state, ctx) {
    const board = state.board
    const cols = 8
    const player = ctx.currentPlayer
    const filtered = moves.filter(m => crossesGridLine(m.from, m.to, cols))
    return filtered.filter(m => {
      const testBoard = [...board]
      testBoard[m.to] = testBoard[m.from]
      testBoard[m.from] = null
      if (m.promotion) testBoard[m.to] = { type: m.promotion, owner: player }
      return !isInGridCheck(testBoard, player, cols)
    })
  },
}

function crossesGridLine(from, to, cols) {
  const fr = Math.floor(from / cols), fc = from % cols
  const tr = Math.floor(to / cols), tc = to % cols
  return Math.floor(fr / 2) !== Math.floor(tr / 2) || Math.floor(fc / 2) !== Math.floor(tc / 2)
}

function isInGridCheck(board, player, cols) {
  let kingPos = -1
  for (let i = 0; i < board.length; i++) {
    if (board[i] && board[i].type === 'king' && board[i].owner === player) { kingPos = i; break }
  }
  if (kingPos === -1) return false
  const attacker = 1 - player
  const rows = board.length / cols
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].owner !== attacker) continue
    if (!crossesGridLine(i, kingPos, cols)) continue
    if (pieceAttacksSquare(board[i], i, kingPos, board, cols, rows)) return true
  }
  return false
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
