const PIECE_SYMBOLS = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N' }

export function moveToSAN(move, board, topology) {
  if (!topology) return fallbackNotation(move)
  const cols = topology.cols || 8
  const rows = topology.rows || 8

  if (move.action === 'drop') {
    const to = indexToAlgebraic(move.to, rows, cols)
    return (PIECE_SYMBOLS[move.type] || move.type[0].toUpperCase()) + '@' + to
  }
  if (move.action === 'blocker') return '🦆' + indexToAlgebraic(move.to, rows, cols)
  if (move.action === 'place') return (PIECE_SYMBOLS[move.type] || move.type[0].toUpperCase()) + '@' + indexToAlgebraic(move.to, rows, cols)
  if (move.action) return move.action

  if (move.castle) {
    const fromCol = move.from % cols
    const toCol = move.to % cols
    return toCol > fromCol ? 'O-O' : 'O-O-O'
  }

  const piece = board[move.to]
  const movedPiece = board[move.from] || piece
  const type = movedPiece ? movedPiece.type : null
  const symbol = (type && type !== 'pawn') ? (PIECE_SYMBOLS[type] || type[0].toUpperCase()) : ''
  const to = indexToAlgebraic(move.to, rows, cols)
  const from = indexToAlgebraic(move.from, rows, cols)
  const captured = move.capture || move.enPassant
  const captureStr = captured ? 'x' : ''
  const pawnFile = (!symbol && captured) ? from[0] : ''
  const disambig = (symbol && symbol !== 'K') ? from[0] : ''
  const promo = move.promotion ? '=' + (PIECE_SYMBOLS[move.promotion] || move.promotion[0].toUpperCase()) : ''

  return symbol + disambig + pawnFile + captureStr + to + promo
}

function indexToAlgebraic(idx, rows, cols) {
  const r = Math.floor(idx / cols)
  const c = idx % cols
  return String.fromCharCode(97 + c) + (rows - r)
}

function fallbackNotation(move) {
  if (move.action) return move.action
  return `${move.from}-${move.to}`
}
