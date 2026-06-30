export function createCheckRule(config = {}) {
  const enabled = config.enabled !== false
  const royalType = config.royalType || 'king'
  const checkBothSides = config.checkBothSides || false

  function findRoyal(board, playerIdx, topology) {
    if (Array.isArray(board)) {
      return board.findIndex(c => c && c.type === royalType && c.owner === playerIdx)
    }
    const positions = topology ? topology.getAllCells() : Object.keys(board)
    for (const pos of positions) {
      const cell = board[pos] || null
      if (cell && cell.type === royalType && cell.owner === playerIdx) return pos
    }
    return Array.isArray(board) ? -1 : null
  }

  function isInCheck(board, playerIdx, ctx) {
    const royalPos = findRoyal(board, playerIdx, ctx.topology)
    const missing = Array.isArray(board) ? royalPos === -1 : royalPos === null
    if (missing) return true
    const attackDetection = ctx.rules.get('attack-detection')
    if (!attackDetection) return false
    const checkCtx = { ...ctx, playerIndex: playerIdx }
    return attackDetection.isAttacked(royalPos, { board }, checkCtx)
  }

  return {
    id: 'check',
    category: 'constraint',
    requires: ['attack-detection'],
    topologyNeeds: [],

    provides: { isInCheck, findRoyal },

    hooks: {
      moveFilter(moves, state, ctx) {
        if (!enabled) return moves
        const { playerIndex } = ctx
        const attackDetection = ctx.rules.get('attack-detection')
        if (!attackDetection) return moves

        return moves.filter(move => {
          const testBoard = cloneBoard(state.board)
          if (move.castle) {
            setCell(testBoard, move.to, getCell(testBoard, move.from))
            setCell(testBoard, move.from, null)
            setCell(testBoard, move.rookTo, getCell(testBoard, move.rookFrom))
            setCell(testBoard, move.rookFrom, null)
          } else if (move.enPassant) {
            setCell(testBoard, move.to, getCell(testBoard, move.from))
            setCell(testBoard, move.from, null)
            setCell(testBoard, move.captured, null)
          } else {
            setCell(testBoard, move.to, getCell(testBoard, move.from))
            setCell(testBoard, move.from, null)
          }
          if (move.promotion) {
            setCell(testBoard, move.to, { type: move.promotion, owner: playerIndex })
          }

          const selfCheck = isInCheck(testBoard, playerIndex, ctx)
          if (selfCheck) return false

          if (checkBothSides) {
            const opponent = 1 - playerIndex
            const givesCheck = isInCheck(testBoard, opponent, { ...ctx, playerIndex: opponent })
            if (givesCheck) return false
          }

          return true
        })
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
