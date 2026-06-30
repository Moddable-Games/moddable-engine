export function createCaptureReplacementRule(config = {}) {
  const skipFlags = config.skipFlags || []

  return {
    id: 'capture.replacement',
    category: 'capture',
    requires: [],
    topologyNeeds: [],

    configSchema: {
      skipFlags: { type: 'array', default: [] },
    },

    hooks: {
      applyMove(move, state, ctx) {
        for (const flag of skipFlags) {
          if (move[flag]) return null
        }

        const board = cloneBoard(state.board)
        const piece = getCell(board, move.from)
        if (!piece) return null

        setCell(board, move.from, null)
        setCell(board, move.to, piece)

        return { board }
      },
    },
  }
}

function getCell(board, pos) {
  if (Array.isArray(board)) return board[pos]
  return board[pos] || null
}

function setCell(board, pos, value) {
  board[pos] = value
}

function cloneBoard(board) {
  if (Array.isArray(board)) return [...board]
  return { ...board }
}
