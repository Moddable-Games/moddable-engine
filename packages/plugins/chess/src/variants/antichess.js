export const antichess = {
  key: 'antichess',

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
    const opponent = 1 - ctx.currentPlayer
    let hasPiece = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === opponent) {
        hasPiece = true
        break
      }
    }
    if (!hasPiece) return opponent
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

}
