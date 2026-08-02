export const extinction = {
  key: 'extinction',
  label: 'Extinction Chess',
  group: 'Alternate Rules',
  title: 'Extinction Chess',
  description: 'You lose when any one piece type is completely eliminated from your army.',
  rule: 'Board: 8x8 · Win: Eliminate a piece type',
  rows: 8,
  cols: 8,
  noCheck: true,

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
        if (!has[t]) return player === 0 ? 'black' : 'white'
      }
    }
    return null
  },
}

export const singleCheck = {
  key: 'singleCheck',
  label: 'Single Check',
  group: 'Tactical',
  title: 'Single Check',
  description: 'Deliver just one check to win instantly.',
  rule: 'Board: 8x8 · Win: Checkmate or 1 check',
  rows: 8,
  cols: 8,
  checkThreshold: 1,

  winCondition(state, ctx) {
    const threshold = ctx.config?.checkThreshold || 1
    const checks = state.checkCount || { 0: 0, 1: 0 }
    if (checks[0] >= threshold) return 'white'
    if (checks[1] >= threshold) return 'black'
    return null
  },
}

export const codrus = {
  key: 'codrus',
  label: 'Codrus',
  group: 'Alternate Rules',
  title: 'Codrus',
  description: 'Lose your king to win. No check concept. Arrange for your king to be captured.',
  rule: 'Board: 8x8 · Win: Lose your king',
  rows: 8,
  cols: 8,
  noCheck: true,
  castling: false,

  winCondition(state, ctx) {
    const board = state.board
    let whiteKing = false, blackKing = false
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].type !== 'king') continue
      if (board[i].owner === 0) whiteKing = true
      else blackKing = true
    }
    if (!whiteKing) return 'white'
    if (!blackKing) return 'black'
    return null
  },
}

export const omnicide = {
  key: 'omnicide',
  label: 'Omnicide',
  group: 'Alternate Rules',
  title: 'Omnicide',
  description: 'Lose all your pieces to win. Captures are NOT forced (unlike Antichess). The king is just another piece.',
  rule: 'Board: 8x8 · Win: Lose all pieces',
  rows: 8,
  cols: 8,
  noCheck: true,

  winCondition(state, ctx) {
    const board = state.board
    const opponent = 1 - ctx.currentPlayer
    let hasPiece = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === opponent) { hasPiece = true; break }
    }
    if (!hasPiece) return opponent === 0 ? 'white' : 'black'
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
      if (topPiece && topPiece.type === 'pawn' && topPiece.owner === 0) return 'white'
      const botPiece = board[(6) * cols + c]
      if (botPiece && botPiece.type === 'pawn' && botPiece.owner === 1) return 'black'
    }
    return null
  },
}

export const shatar = {
  key: 'shatar',
  label: 'Shatar',
  group: 'Historical',
  title: 'Shatar (Mongolian Chess)',
  description: 'Mongolian chess. No check concept. Win by capturing the king or baring it (leaving only the king).',
  rule: 'Board: 8x8 · Win: Capture king or bare it',
  rows: 8,
  cols: 8,
  noCheck: true,

  winCondition(state, ctx) {
    const board = state.board
    let wCount = 0, bCount = 0, wKing = false, bKing = false
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue
      if (board[i].owner === 0) { wCount++; if (board[i].type === 'king') wKing = true }
      else { bCount++; if (board[i].type === 'king') bKing = true }
    }
    if (!wKing) return 'black'
    if (!bKing) return 'white'
    if (wCount === 1 && wKing) return 'black'
    if (bCount === 1 && bKing) return 'white'
    return null
  },
}
