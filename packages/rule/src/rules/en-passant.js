export function createEnPassantRule(config = {}) {
  const enabled = config.enabled !== false

  return {
    id: 'en-passant',
    category: 'movement',
    requires: [],
    topologyNeeds: [],

    stateShape: { enPassantTarget: null },

    hooks: {
      init() {
        if (!enabled) return null
        return { enPassantTarget: null }
      },

      applyMove(move, state, ctx) {
        if (!enabled) return null
        const { topology } = ctx
        const cols = topology ? topology.cols : 8

        if (move.enPassant) {
          const board = [...state.board]
          board[move.to] = board[move.from]
          board[move.from] = null
          board[move.captured] = null
          return { board, enPassantTarget: null, handled: true }
        }

        const piece = state.board[move.from]
        if (!piece) return { enPassantTarget: null }

        const pawnType = config.pawnType || 'pawn'
        if (piece.type === pawnType && Math.abs(move.to - move.from) === cols * 2) {
          return { enPassantTarget: (move.from + move.to) / 2 }
        }

        return { enPassantTarget: null }
      },

      getLegalMoves(state, ctx) {
        if (!enabled || state.enPassantTarget === null) return null
        const { topology, playerIndex } = ctx
        const cols = topology ? topology.cols : 8
        const pawnType = config.pawnType || 'pawn'

        const advancement = config.advancement || ctx.config?.advancement
        if (!advancement) return null
        const dir = typeof advancement === 'function'
          ? advancement(playerIndex)
          : advancement[playerIndex]
        if (!dir) return null

        const epTarget = state.enPassantTarget
        const moves = []

        const captureFrom = [epTarget - dir * cols - 1, epTarget - dir * cols + 1]
        for (const from of captureFrom) {
          if (from < 0 || from >= state.board.length) continue
          const piece = state.board[from]
          if (!piece || piece.type !== pawnType || piece.owner !== playerIndex) continue
          const fromCol = from % cols
          const targetCol = epTarget % cols
          if (Math.abs(targetCol - fromCol) !== 1) continue
          const capturedPawn = epTarget - dir * cols
          moves.push({ from, to: epTarget, capture: true, enPassant: true, captured: capturedPawn })
        }

        return moves.length > 0 ? moves : null
      },
    },
  }
}
