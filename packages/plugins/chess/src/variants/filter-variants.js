export const giveaway = {
  key: 'giveaway',
  label: 'Giveaway',
  group: 'Alternate Rules',
  title: 'Giveaway Chess',
  description: 'Captures mandatory. Lose all pieces to win. Stalemate is a loss for the stalemated player.',
  rule: 'Board: 8x8 · Win: Lose all pieces (stalemate = loss)',
  rows: 8,
  cols: 8,
  castling: false,
  noCheck: true,
  stalemateMeaning: 'loss',

  moveFilter(moves, state, ctx) {
    const board = state.board
    const captures = moves.filter(m => {
      const target = board[m.to]
      return (target !== null && target !== undefined) || m.enPassant
    })
    return captures.length > 0 ? captures : moves
  },

  winCondition(state, ctx) {
    const board = state.board
    const currentPlayer = ctx.currentPlayer
    let hasPiece = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === currentPlayer) { hasPiece = true; break }
    }
    if (!hasPiece) return currentPlayer === 0 ? 'white' : 'black'
    return null
  },
}

export const suicideChess = {
  key: 'suicideChess',
  label: 'Suicide Chess',
  group: 'Alternate Rules',
  title: 'Suicide Chess',
  description: 'Captures mandatory. Lose all pieces to win. Stalemate is a draw.',
  rule: 'Board: 8x8 · Win: Lose all pieces (stalemate = draw)',
  rows: 8,
  cols: 8,
  castling: false,
  noCheck: true,

  moveFilter(moves, state, ctx) {
    const board = state.board
    const captures = moves.filter(m => {
      const target = board[m.to]
      return (target !== null && target !== undefined) || m.enPassant
    })
    return captures.length > 0 ? captures : moves
  },

  winCondition(state, ctx) {
    const board = state.board
    const currentPlayer = ctx.currentPlayer
    let hasPiece = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === currentPlayer) { hasPiece = true; break }
    }
    if (!hasPiece) return currentPlayer === 0 ? 'white' : 'black'
    return null
  },
}

export const patrolChess = {
  key: 'patrolChess',
  label: 'Patrol Chess',
  group: 'Alternate Rules',
  title: 'Patrol Chess',
  description: 'A piece can only capture if it is defended by a friendly piece. Non-capturing moves unrestricted.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

  moveFilter(moves, state, ctx) {
    const board = state.board
    const cols = 8
    return moves.filter(m => {
      const target = board[m.to]
      const isCapture = (target !== null && target !== undefined) || m.enPassant
      if (!isCapture) return true
      return isPatrolled(board, m.from, ctx.currentPlayer, cols)
    })
  },
}

export const makpong = {
  key: 'makpong',
  label: 'Makpong',
  group: 'Historical',
  title: 'Makpong (Thai Chess Variant)',
  description: 'When in check, the king cannot move. Must block or capture with another piece.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

  moveFilter(moves, state, ctx) {
    const board = state.board
    const cols = 8
    const playerIdx = ctx.currentPlayer
    if (!isKingInCheck(board, playerIdx, cols)) return moves
    return moves.filter(m => {
      const piece = board[m.from]
      return piece && piece.type !== 'king'
    })
  },
}

function isPatrolled(board, sq, owner, cols) {
  const rows = board.length / cols
  const r = Math.floor(sq / cols), c = sq % cols
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].owner !== owner || i === sq) continue
    if (pieceAttacksSquare(board[i], i, sq, board, cols, rows)) return true
  }
  return false
}

function isKingInCheck(board, player, cols) {
  let kingPos = -1
  for (let i = 0; i < board.length; i++) {
    if (board[i] && board[i].type === 'king' && board[i].owner === player) { kingPos = i; break }
  }
  if (kingPos === -1) return false
  const attacker = 1 - player
  const rows = board.length / cols
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].owner !== attacker) continue
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

export const gridChess = {
  key: 'gridChess',
  label: 'Grid Chess',
  group: 'Alternate Rules',
  title: 'Grid Chess',
  description: 'Moves must cross at least one 2x2 grid line. Attacks only count if they cross a grid line.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,
  noCheck: true,

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

export const madrasiChess = {
  key: 'madrasiChess',
  label: 'Madrasi Chess',
  group: 'Alternate Rules',
  title: 'Madrasi Chess',
  description: 'Opposing pieces of the same type that attack each other are paralysed. Kings exempt.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

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

export const weakChess = {
  key: 'weakChess',
  label: 'Weak Chess',
  group: 'Alternate Rules',
  title: 'Weak Chess',
  description: 'The weakest piece type that has a legal move MUST move. Pawn < Knight < Bishop < Rook < Queen < King.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

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

export const noRetreat = {
  key: 'noRetreat',
  label: 'No Retreat',
  group: 'Alternate Rules',
  title: 'No Retreat Chess',
  description: 'Pieces cannot move backward toward their starting rank.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

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
