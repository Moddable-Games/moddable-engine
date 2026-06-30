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
        const { topology } = ctx
        if (!topology) return false
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
        const board = [...state.board]
        const piece = board[move.to] || board[move.from]
        const owner = piece ? piece.owner : ctx.playerIndex
        board[move.to] = { type: move.promotion, owner }
        return { board }
      },
    },
  }
}
