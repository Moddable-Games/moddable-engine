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
  stalemateMeaning: 'win',

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
