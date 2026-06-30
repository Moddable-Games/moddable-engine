export function createDraw50MoveRule(config = {}) {
  const threshold = config.threshold || 100
  const pawnType = config.pawnType || 'pawn'

  return {
    id: 'draw.50-move',
    category: 'draw',
    requires: [],
    topologyNeeds: [],

    stateShape: { halfmoveClock: 0 },

    hooks: {
      init() {
        return { halfmoveClock: 0 }
      },

      beforeMove(move, state) {
        const board = state.board
        const piece = Array.isArray(board) ? board[move.from] : (board[move.from] || null)
        const target = Array.isArray(board) ? board[move.to] : (board[move.to] || null)
        const isPawnMove = piece && piece.type === pawnType
        const isCapture = move.capture || (target !== null)
        const halfmoveClock = (isPawnMove || isCapture) ? 0 : (state.halfmoveClock || 0) + 1
        return { halfmoveClock }
      },

      checkWin(state) {
        if ((state.halfmoveClock || 0) >= threshold) return 'draw'
        return null
      },
    },
  }
}
