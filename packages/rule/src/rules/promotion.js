export function createPromotionRule(config = {}) {
  const choices = config.choices || ['queen', 'rook', 'bishop', 'knight']
  const pawnType = config.pawnType || 'pawn'

  return {
    id: 'promotion',
    category: 'movement',
    requires: [],
    topologyNeeds: [],

    provides: {
      getChoices() { return choices },
      isPromotionZone(pos, owner, ctx) {
        if (config.promotionCells) {
          const cells = config.promotionCells[owner]
          if (cells) return cells.has ? cells.has(pos) : cells.includes(pos)
          return false
        }
        const { topology } = ctx
        if (!topology || topology.cols === undefined) return false
        const cols = topology.cols
        const row = Math.floor(pos / cols)

        if (config.promotionRank) {
          if (typeof config.promotionRank === 'function') {
            return row === config.promotionRank(owner, ctx)
          }
          return row === config.promotionRank[owner]
        }

        const advancement = config.advancement || ctx.config?.advancement
        if (!advancement) return false
        const dir = typeof advancement === 'function'
          ? advancement(owner)
          : advancement[owner]

        if (dir === -1) return row === 0
        if (dir === 1) return row === topology.rows - 1
        return false
      },
    },

    hooks: {
      applyMove(move, state, ctx) {
        if (!move.promotion) return null
        const board = cloneBoard(state.board)
        const piece = getCell(board, move.to) || getCell(board, move.from)
        const owner = piece ? piece.owner : ctx.playerIndex
        setCell(board, move.to, { type: move.promotion, owner })
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
