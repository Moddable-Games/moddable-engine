export function createCheckRule(config = {}) {
  const enabled = config.enabled !== false
  const royalType = config.royalType || 'king'
  const checkBothSides = config.checkBothSides || false

  function findRoyal(board, playerIdx) {
    return board.findIndex(c => c && c.type === royalType && c.owner === playerIdx)
  }

  function isInCheck(board, playerIdx, ctx) {
    const royalPos = findRoyal(board, playerIdx)
    if (royalPos === -1) return true
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
          const testBoard = [...state.board]
          if (move.castle) {
            testBoard[move.to] = testBoard[move.from]
            testBoard[move.from] = null
            testBoard[move.rookTo] = testBoard[move.rookFrom]
            testBoard[move.rookFrom] = null
          } else if (move.enPassant) {
            testBoard[move.to] = testBoard[move.from]
            testBoard[move.from] = null
            testBoard[move.captured] = null
          } else {
            testBoard[move.to] = testBoard[move.from]
            testBoard[move.from] = null
          }
          if (move.promotion) {
            testBoard[move.to] = { type: move.promotion, owner: playerIndex }
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
