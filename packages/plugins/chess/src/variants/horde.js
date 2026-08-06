export const horde = {
  key: 'horde',

  winCondition(state, ctx) {
    const board = state.board
    const whiteHasPieces = board.some(p => p && p.owner === 0)
    if (!whiteHasPieces) return 1
    return null
  },

  evaluate(state, ctx) {
    const board = state.board
    let whitePawns = 0, blackMaterial = 0
    const VALS = { king: 20000, queen: 900, rook: 500, bishop: 330, knight: 320, pawn: 100 }
    for (let i = 0; i < board.length; i++) {
      const p = board[i]
      if (!p) continue
      if (p.owner === 0) whitePawns++
      else blackMaterial += VALS[p.type] || 100
    }
    if (ctx.currentPlayer === 0) return whitePawns * 30 - blackMaterial * 0.3
    return blackMaterial * 0.3 - whitePawns * 30
  },

}
