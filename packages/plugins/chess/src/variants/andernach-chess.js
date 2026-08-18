export const andernachChess = {
  key: 'andernachChess',
  slug: 'andernach',

  moveFilter(moves, state, ctx) {
    const board = state.board
    const playerIdx = ctx.currentPlayer
    const royalType = 'king'
    let kingPos = null
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].type === royalType && board[i].owner === playerIdx) {
        kingPos = i; break
      }
    }
    if (kingPos === null) return moves
    const cols = 8
    const rows = board.length / cols

    return moves.filter(m => {
      const target = board[m.to]
      if (!target) return true
      const piece = board[m.from]
      if (piece.type === 'king') return true
      const flippedOwner = 1 - playerIdx
      const flippedType = piece.type
      const kPos = m.from === kingPos ? m.to : kingPos
      if (!attacksSquare(m.to, flippedType, flippedOwner, kPos, board, m.from, m.to, cols, rows)) return true
      return false
    })
  },

  afterMove(ctx) {
    const { move, captured, board } = ctx
    if (!captured) return
    const piece = board[move.to]
    if (!piece || piece.type === 'king') return
    board[move.to] = { type: piece.type, owner: 1 - piece.owner }
  },
}

function attacksSquare(from, type, owner, target, board, movedFrom, movedTo, cols, rows) {
  const fr = Math.floor(from / cols), fc = from % cols
  const tr = Math.floor(target / cols), tc = target % cols
  const dr = tr - fr, dc = tc - fc

  if (type === 'knight') {
    return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)
  }
  if (type === 'pawn') {
    const fwd = owner === 0 ? -1 : 1
    return dr === fwd && Math.abs(dc) === 1
  }
  if (type === 'king') {
    return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0)
  }

  const isRookLike = type === 'rook' || type === 'queen'
  const isBishopLike = type === 'bishop' || type === 'queen'

  if (dr === 0 && dc !== 0 && isRookLike) {
    const step = dc > 0 ? 1 : -1
    for (let c = fc + step; c !== tc; c += step) {
      const sq = fr * cols + c
      if (sq === movedFrom) continue
      if (board[sq] && sq !== movedTo) return false
    }
    return true
  }
  if (dc === 0 && dr !== 0 && isRookLike) {
    const step = dr > 0 ? 1 : -1
    for (let r = fr + step; r !== tr; r += step) {
      const sq = r * cols + fc
      if (sq === movedFrom) continue
      if (board[sq] && sq !== movedTo) return false
    }
    return true
  }
  if (Math.abs(dr) === Math.abs(dc) && dr !== 0 && isBishopLike) {
    const stepR = dr > 0 ? 1 : -1, stepC = dc > 0 ? 1 : -1
    let r = fr + stepR, c = fc + stepC
    while (r !== tr || c !== tc) {
      const sq = r * cols + c
      if (sq === movedFrom) { r += stepR; c += stepC; continue }
      if (board[sq] && sq !== movedTo) return false
      r += stepR; c += stepC
    }
    return true
  }
  return false
}
