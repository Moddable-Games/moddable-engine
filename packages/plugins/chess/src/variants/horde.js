export const horde = {
  key: 'horde',
  label: 'Horde Chess',
  group: 'Alternate Rules',
  title: 'Horde Chess',
  description: 'Massively asymmetric. White has 36 pawns filling ranks 1-4. Black has a normal army.',
  rule: 'Board: 8x8 · Win: Checkmate (Black) or eliminate horde',
  rows: 8,
  cols: 8,
  setup: 'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP',

  winCondition(state, ctx) {
    const board = state.board
    const whiteHasPieces = board.some(p => p && p.owner === 0)
    if (!whiteHasPieces) return 'black'
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

  openingBook: {
    'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq -': ['f5f6', 'c5c6', 'e4e5'],
  },
}
