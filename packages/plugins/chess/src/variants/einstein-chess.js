const HIERARCHY = ['pawn', 'knight', 'bishop', 'rook', 'queen']

export const einsteinChess = {
  key: 'einsteinChess',
  slug: 'einstein-chess',

  afterMove(ctx) {
    const { move, captured, board } = ctx
    const piece = board[move.to]
    if (!piece || piece.type === 'king') return
    const idx = HIERARCHY.indexOf(piece.type)
    if (idx < 0) return
    const isCapture = !!captured
    const newIdx = isCapture
      ? Math.min(idx + 1, HIERARCHY.length - 1)
      : Math.max(idx - 1, 0)
    if (newIdx !== idx) {
      board[move.to] = { type: HIERARCHY[newIdx], owner: piece.owner }
    }
  },
}
