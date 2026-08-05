export const medusaChess = {
  key: 'medusaChess',

  afterMove(ctx) {
    const { move, board, effects, topology, playerIdx } = ctx
    const piece = board[move.to]
    if (!piece || piece.type !== 'queen') return
    const cols = topology ? topology.cols : 8
    const rows = board.length / cols
    const owner = piece.owner
    const opponent = 1 - owner
    const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    const r = Math.floor(move.to / cols), c = move.to % cols
    for (const [dr, dc] of DIRS) {
      let nr = r + dr, nc = c + dc
      while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const sq = nr * cols + nc
        const target = board[sq]
        if (target) {
          if (target.owner === opponent && target.type !== 'king') {
            if (!ctx.hasEffect(sq, 'petrify')) {
              ctx.addEffect({ sq, type: 'petrify', duration: 2, owner })
            }
          }
          break
        }
        nr += dr; nc += dc
      }
    }
  },

  moveFilter(moves, state, ctx) {
    const effects = state.effects || []
    return moves.filter(m => !effects.some(e => e.sq === m.from && e.type === 'petrify'))
  },
}
