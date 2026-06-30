export function createPromotionRankReachRule(config = {}) {
  const promotionRank = config.promotionRank !== undefined ? config.promotionRank : null
  const promotedType = config.promotedType || 'king'
  const eligibleTypes = config.eligibleTypes || ['man']
  const perPlayer = config.perPlayer || null

  return {
    id: 'promotion.rank-reach',
    category: 'effect',
    requires: [],
    topologyNeeds: [],

    configSchema: {
      promotionRank: { type: 'any', default: null },
      promotedType: { type: 'string', default: 'king' },
      eligibleTypes: { type: 'array', default: ['man'] },
      perPlayer: { type: 'object', default: null },
    },

    hooks: {
      afterMove(move, state, ctx) {
        const landing = move.to !== undefined ? move.to : move.landing
        if (landing === undefined) return null

        const board = state.board
        const piece = getCell(board, landing)
        if (!piece) return null

        const pieceType = typeof piece === 'string' ? piece : piece.type
        if (!eligibleTypes.includes(pieceType)) return null

        const playerIndex = ctx.playerIndex !== undefined ? ctx.playerIndex : null
        const targetRank = getPromotionRank(playerIndex, landing, state, ctx)
        if (targetRank === null) return null

        if (!isOnRank(landing, targetRank, state, ctx)) return null

        const newBoard = cloneBoard(board)
        const promoted = typeof piece === 'string'
          ? promotedType
          : { ...piece, type: promotedType }
        setCell(newBoard, landing, promoted)

        return { board: newBoard }
      },
    },
  }

  function getPromotionRank(playerIndex, pos, state, ctx) {
    if (perPlayer && playerIndex !== null) {
      return perPlayer[playerIndex] !== undefined ? perPlayer[playerIndex] : promotionRank
    }
    return promotionRank
  }

  function isOnRank(pos, rank, state, ctx) {
    if (typeof rank === 'function') return rank(pos, state, ctx)
    if (typeof pos === 'number') {
      const cols = (ctx.topology && ctx.topology.cols) || state._cols
      if (cols) {
        const row = Math.floor(pos / cols)
        return row === rank
      }
    }
    return false
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
  if (Array.isArray(board)) return board.map(c => c && typeof c === 'object' ? { ...c } : c)
  const clone = {}
  for (const key in board) {
    clone[key] = board[key] && typeof board[key] === 'object' ? { ...board[key] } : board[key]
  }
  return clone
}
