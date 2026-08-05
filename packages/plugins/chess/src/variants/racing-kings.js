export const racingKings = {
  key: 'racingKings',

  moveFilter(moves, state, ctx) {
    return moves.filter(m => {
      const board = [...state.board]
      board[m.to] = board[m.from]
      board[m.from] = null
      const currentPlayer = ctx.currentPlayer
      const opponent = 1 - currentPlayer
      return !isKingAttacked(board, opponent, ctx) && !isKingAttacked(board, currentPlayer, ctx)
    })
  },

  winCondition(state, ctx) {
    const board = state.board
    const cols = 8
    for (let c = 0; c < cols; c++) {
      const piece = board[c]
      if (piece && piece.type === 'king') {
        return piece.owner
      }
    }
    return null
  },

  evaluate(state, ctx) {
    const board = state.board
    const cols = 8
    let myKingRank = 7, oppKingRank = 7
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].type !== 'king') continue
      const rank = Math.floor(i / cols)
      if (board[i].owner === ctx.currentPlayer) myKingRank = rank
      else oppKingRank = rank
    }
    if (myKingRank === 0) return 100000
    if (oppKingRank === 0) return -100000
    return (oppKingRank - myKingRank) * 300
  },

}

function isKingAttacked(board, player, ctx) {
  let kingPos = -1
  for (let i = 0; i < board.length; i++) {
    if (board[i] && board[i].type === 'king' && board[i].owner === player) {
      kingPos = i
      break
    }
  }
  if (kingPos === -1) return false
  const attacker = 1 - player
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].owner !== attacker) continue
    if (attacks(board[i], i, kingPos, board)) return true
  }
  return false
}

function attacks(piece, from, target, board) {
  const cols = 8
  const fr = Math.floor(from / cols), fc = from % cols
  const tr = Math.floor(target / cols), tc = target % cols
  const dr = tr - fr, dc = tc - fc

  switch (piece.type) {
    case 'king':
      return Math.abs(dr) <= 1 && Math.abs(dc) <= 1
    case 'knight':
      return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)
    case 'rook':
      return (dr === 0 || dc === 0) && pathClear(from, target, board, cols)
    case 'bishop':
      return Math.abs(dr) === Math.abs(dc) && dr !== 0 && pathClear(from, target, board, cols)
    case 'queen':
      return ((dr === 0 || dc === 0) || (Math.abs(dr) === Math.abs(dc) && dr !== 0)) && pathClear(from, target, board, cols)
    case 'pawn': {
      const dir = piece.owner === 0 ? -1 : 1
      return dr === dir && Math.abs(dc) === 1
    }
    default:
      return false
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
    r += stepR
    c += stepC
  }
  return true
}
