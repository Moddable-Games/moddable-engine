export const immunizationChess = {
  key: 'immunizationChess',

  afterMove(ctx) {
    const { move, captured, board, effects, topology, playerIdx } = ctx
    if (move.from !== move.to) {
      for (const eff of effects) {
        if (eff.type === 'immune' && eff.sq === move.from && eff.owner === playerIdx) {
          eff.sq = move.to
          break
        }
      }
    }
    if (!captured) return
    const cols = topology ? topology.cols : 8
    const rows = board.length / cols
    const capR = Math.floor(move.to / cols), capC = move.to % cols
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = capR + dr, nc = capC + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        const sq = nr * cols + nc
        const piece = board[sq]
        if (!piece) continue
        if (piece.owner !== playerIdx && piece.type !== 'king') {
          if (!ctx.hasEffect(sq, 'immune')) {
            ctx.addEffect({ sq, type: 'immune', duration: 4, owner: piece.owner })
          }
        }
      }
    }
  },

  moveFilter(moves, state, ctx) {
    const effects = state.effects || []
    return moves.filter(m => {
      const target = state.board[m.to]
      if (!target) return true
      return !effects.some(e => e.sq === m.to && e.type === 'immune')
    })
  },
}
