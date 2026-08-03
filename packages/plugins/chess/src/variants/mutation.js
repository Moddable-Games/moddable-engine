const HIERARCHY = ['pawn', 'knight', 'bishop', 'rook', 'queen']

export const einsteinChess = {
  key: 'einsteinChess',

  afterMove(ctx) {
    const { move, captured, board } = ctx
    const piece = board[move.to]
    if (!piece || piece.type === 'king') return
    const idx = HIERARCHY.indexOf(piece.type)
    if (idx < 0) return
    const isCapture = !!captured
    const newIdx = isCapture
      ? Math.min(idx + 1, HIERARCHY.length - 1)
      : Math.max(idx - 1, 0)
    if (newIdx !== idx) {
      board[move.to] = { type: HIERARCHY[newIdx], owner: piece.owner }
    }
  },
}

export const andernachChess = {
  key: 'andernachChess',

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

export const benedictChess = {
  key: 'benedictChess',
  noCheck: true,

  moveFilter(moves, state, ctx) {
    const board = state.board
    return moves.filter(m => board[m.to] === null)
  },

  afterMove(ctx) {
    const { move, board, playerIdx, topology } = ctx
    const piece = board[move.to]
    if (!piece) return
    const owner = piece.owner
    const opponent = 1 - owner
    const cols = topology ? topology.cols : 8
    const rows = board.length / cols
    const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    const r = Math.floor(move.to / cols), c = move.to % cols

    const attacked = new Set()
    if (piece.type === 'queen' || piece.type === 'rook') {
      for (const [dr, dc] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        let nr = r + dr, nc = c + dc
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const sq = nr * cols + nc
          if (board[sq]) { attacked.add(sq); break }
          nr += dr; nc += dc
        }
      }
    }
    if (piece.type === 'queen' || piece.type === 'bishop') {
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let nr = r + dr, nc = c + dc
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const sq = nr * cols + nc
          if (board[sq]) { attacked.add(sq); break }
          nr += dr; nc += dc
        }
      }
    }
    if (piece.type === 'knight') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          attacked.add(nr * cols + nc)
        }
      }
    }
    if (piece.type === 'rook' || piece.type === 'queen' || piece.type === 'bishop' || piece.type === 'knight') {
      // already handled above
    } else if (piece.type === 'king') {
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          attacked.add(nr * cols + nc)
        }
      }
    } else if (piece.type === 'pawn') {
      const fwd = owner === 0 ? -1 : 1
      for (const dc of [-1, 1]) {
        const nr = r + fwd, nc = c + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          attacked.add(nr * cols + nc)
        }
      }
    }

    for (const sq of attacked) {
      const target = board[sq]
      if (target && target.owner === opponent) {
        board[sq] = { type: target.type, owner }
      }
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
    if (!whiteKing) return 1
    if (!blackKing) return 0
    return null
  },
}

export const recruitmentChess = {
  key: 'recruitmentChess',

  afterMove(ctx) {
    const { move, captured, board, playerIdx } = ctx
    if (!captured) return
    if (captured.type === 'king') return
    board[move.from] = { type: captured.type, owner: playerIdx }
  },
}

const ABILITY_BITS = { knight: 1, bishop: 2, rook: 4, queen: 6 }

function abilitiesOf(type) {
  if (type === 'queen') return 6
  if (type === 'rook') return 4
  if (type === 'bishop') return 2
  if (type === 'knight') return 1
  return 0
}

function typeForAbilities(ab) {
  if (ab >= 7) return 'queen'
  if (ab === 6) return 'queen'
  if (ab === 5) return 'queen'
  if (ab === 4) return 'rook'
  if (ab === 3) return 'queen'
  if (ab === 2) return 'bishop'
  if (ab === 1) return 'knight'
  return null
}

export const absorptionChess = {
  key: 'absorptionChess',

  afterMove(ctx) {
    const { move, captured, board } = ctx
    if (!captured) return
    const piece = board[move.to]
    if (!piece || piece.type === 'king') return
    const currentAb = abilitiesOf(piece.type)
    const victimAb = abilitiesOf(captured.type)
    const newAb = currentAb | victimAb
    if (newAb === currentAb) return
    const newType = typeForAbilities(newAb)
    if (newType && newType !== piece.type) {
      board[move.to] = { type: newType, owner: piece.owner }
    }
  },
}
