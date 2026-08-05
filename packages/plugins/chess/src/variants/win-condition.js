export const extinction = {
  key: 'extinction',

  winCondition(state, ctx) {
    const board = state.board
    const types = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
    for (const player of [0, 1]) {
      const has = {}
      for (const t of types) has[t] = false
      for (let i = 0; i < board.length; i++) {
        if (board[i] && board[i].owner === player) has[board[i].type] = true
      }
      for (const t of types) {
        if (!has[t]) return 1 - player
      }
    }
    return null
  },
}

export const singleCheck = {
  key: 'singleCheck',

  winCondition(state, ctx) {
    const threshold = ctx.config?.checkThreshold || 1
    const checks = state.checkCount || { 0: 0, 1: 0 }
    if (checks[0] >= threshold) return 0
    if (checks[1] >= threshold) return 1
    return null
  },
}

export const codrus = {
  key: 'codrus',

  winCondition(state, ctx) {
    const board = state.board
    let whiteKing = false, blackKing = false
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].type !== 'king') continue
      if (board[i].owner === 0) whiteKing = true
      else blackKing = true
    }
    if (!whiteKing) return 0
    if (!blackKing) return 1
    return null
  },
}

export const omnicide = {
  key: 'omnicide',

  winCondition(state, ctx) {
    const board = state.board
    const opponent = 1 - ctx.currentPlayer
    let hasPiece = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === opponent) { hasPiece = true; break }
    }
    if (!hasPiece) return opponent
    return null
  },
}

export const breakthrough = {
  key: 'breakthrough',
  label: 'Breakthrough',
  group: 'Alternate Rules',
  title: 'Breakthrough',
  description: 'Pawns-only on 7x7. First pawn to reach the far rank wins. No check, no castling, no promotion.',
  rule: 'Board: 7x7 · Win: Reach far rank',
  rows: 7,
  cols: 7,
  setup: 'ppppppp/ppppppp/7/7/7/PPPPPPP/PPPPPPP',
  noCheck: true,
  castling: false,
  enPassant: false,

  winCondition(state, ctx) {
    const board = state.board
    const cols = 7
    for (let c = 0; c < cols; c++) {
      const topPiece = board[c]
      if (topPiece && topPiece.type === 'pawn' && topPiece.owner === 0) return 0
      const botPiece = board[(6) * cols + c]
      if (botPiece && botPiece.type === 'pawn' && botPiece.owner === 1) return 1
    }
    return null
  },
}

export const shatar = {
  key: 'shatar',

  winCondition(state, ctx) {
    const board = state.board
    let wCount = 0, bCount = 0, wKing = false, bKing = false
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue
      if (board[i].owner === 0) { wCount++; if (board[i].type === 'king') wKing = true }
      else { bCount++; if (board[i].type === 'king') bKing = true }
    }
    if (!wKing) return 1
    if (!bKing) return 0
    if (wCount === 1 && wKing) return 1
    if (bCount === 1 && bKing) return 0
    return null
  },
}
