export function createCaptureReplacementRule(config = {}) {
  return {
    id: 'capture.replacement',
    category: 'capture',
    requires: [],
    topologyNeeds: [],

    hooks: {
      applyMove(move, state, ctx) {
        if (move.castle || move.enPassant) return null

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
