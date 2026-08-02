export const checklessChess = {
  key: 'checklessChess',
  label: 'Checkless Chess',
  group: 'Alternate Rules',
  title: 'Checkless Chess',
  description: 'You may not give check unless the move is checkmate.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

  moveFilter(moves, state, ctx) {
    const board = state.board
    const cols = 8
    return moves.filter(m => {
      const testBoard = [...board]
      testBoard[m.to] = testBoard[m.from]
      testBoard[m.from] = null
      if (m.promotion) testBoard[m.to] = { type: m.promotion, owner: ctx.currentPlayer }

      const opponent = 1 - ctx.currentPlayer
      if (!isKingAttacked(testBoard, opponent, cols)) return true
      const oppMoves = generateAllMoves(testBoard, opponent, cols)
      const oppLegal = oppMoves.filter(om => {
        const b2 = [...testBoard]
        b2[om.to] = b2[om.from]
        b2[om.from] = null
        return !isKingAttacked(b2, opponent, cols)
      })
      return oppLegal.length === 0
    })
  },
}

function isKingAttacked(board, player, cols) {
  let kingPos = -1
  for (let i = 0; i < board.length; i++) {
    if (board[i] && board[i].type === 'king' && board[i].owner === player) { kingPos = i; break }
  }
  if (kingPos === -1) return false
  const attacker = 1 - player
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].owner !== attacker) continue
    if (attacks(board[i], i, kingPos, board, cols)) return true
  }
  return false
}

function generateAllMoves(board, player, cols) {
  const moves = []
  const rows = board.length / cols
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].owner !== player) continue
    const piece = board[i]
    const r = Math.floor(i / cols), c = i % cols
    if (piece.type === 'pawn') {
      const dir = player === 0 ? -1 : 1
      const fwd = i + dir * cols
      if (fwd >= 0 && fwd < board.length && !board[fwd]) moves.push({ from: i, to: fwd })
      for (const dc of [-1, 1]) {
        const nc = c + dc
        if (nc < 0 || nc >= cols) continue
        const cap = (r + dir) * cols + nc
        if (cap >= 0 && cap < board.length && board[cap] && board[cap].owner !== player) moves.push({ from: i, to: cap })
      }
    } else {
      const dirs = getDirs(piece.type)
      const sliding = isSliding(piece.type)
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const idx = nr * cols + nc
          if (board[idx] && board[idx].owner === player) break
          moves.push({ from: i, to: idx })
          if (board[idx] || !sliding) break
          nr += dr; nc += dc
        }
      }
    }
  }
  return moves
}

function attacks(piece, from, target, board, cols) {
  const rows = board.length / cols
  const fr = Math.floor(from / cols), fc = from % cols
  const tr = Math.floor(target / cols), tc = target % cols
  const dr = tr - fr, dc = tc - fc
  switch (piece.type) {
    case 'king': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1
    case 'knight': return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)
    case 'rook': return (dr === 0 || dc === 0) && pathClear(from, target, board, cols)
    case 'bishop': return Math.abs(dr) === Math.abs(dc) && dr !== 0 && pathClear(from, target, board, cols)
    case 'queen': return ((dr === 0 || dc === 0) || (Math.abs(dr) === Math.abs(dc) && dr !== 0)) && pathClear(from, target, board, cols)
    case 'pawn': { const dir = piece.owner === 0 ? -1 : 1; return dr === dir && Math.abs(dc) === 1 }
    default: return false
  }
}

function pathClear(from, target, board, cols) {
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

function getDirs(type) {
  switch (type) {
    case 'king': case 'queen': return [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    case 'rook': return [[-1,0],[1,0],[0,-1],[0,1]]
    case 'bishop': return [[-1,-1],[-1,1],[1,-1],[1,1]]
    case 'knight': return [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
    default: return []
  }
}

function isSliding(type) {
  return type === 'rook' || type === 'bishop' || type === 'queen'
}
