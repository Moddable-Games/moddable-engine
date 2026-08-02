export const antichess = {
  key: 'antichess',
  label: 'Antichess',
  group: 'Alternate Rules',
  title: 'Antichess',
  description: 'Captures are mandatory. The goal is to lose all your pieces. No check, no castling.',
  rule: 'Board: 8x8 · Win: Lose all pieces or get stalemated',
  rows: 8,
  cols: 8,
  castling: false,
  noCheck: true,
  stalemateMeaning: 'win',
  promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'king'],

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
      if (board[i] && board[i].owner === currentPlayer) {
        hasPiece = true
        break
      }
    }
    if (!hasPiece) return currentPlayer === 0 ? 'white' : 'black'
    return null
  },

  evaluate(state, ctx) {
    const board = state.board
    const currentPlayer = ctx.currentPlayer
    let myCount = 0, oppCount = 0
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue
      if (board[i].owner === currentPlayer) myCount++
      else oppCount++
    }
    if (myCount === 0) return 100000
    return (oppCount - myCount) * 200
  },

  openingBook: {
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e3', 'b2b4', 'g2g4'],
  },
}
