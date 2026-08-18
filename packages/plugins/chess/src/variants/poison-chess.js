export const poisonChess = {
  key: 'poisonChess',
  slug: 'poison-chess',

  afterMove(ctx) {
    const { move, captured, board, effects, topology, playerIdx } = ctx
    const cols = topology ? topology.cols : 8
    const isCapture = !!captured

    if (isCapture) {
      ctx.addEffect({ sq: move.to, type: 'poison', duration: 3, owner: null })
    }

    if (!isCapture) {
      if (ctx.hasEffect(move.to, 'poison')) {
        const piece = board[move.to]
        if (piece && piece.type !== 'king') {
          board[move.to] = null
        }
      }
    } else {
      const poisonCount = effects.filter(e => e.sq === move.to && e.type === 'poison').length
      if (poisonCount >= 2) {
        const piece = board[move.to]
        if (piece && piece.type !== 'king') {
          board[move.to] = null
        }
      }
    }
  },
}
