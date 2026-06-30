export function createCaptureReplacementRule(config = {}) {
  return {
    id: 'capture.replacement',
    category: 'capture',
    requires: [],
    topologyNeeds: [],

    hooks: {
      applyMove(move, state, ctx) {
        if (move.castle || move.enPassant) return null

        const board = [...state.board]
        const piece = board[move.from]
        if (!piece) return null

        board[move.from] = null
        board[move.to] = piece

        return { board }
      },
    },
  }
}
