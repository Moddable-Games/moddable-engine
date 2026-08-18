export const recruitmentChess = {
  key: 'recruitmentChess',
  slug: 'recruitment-chess',

  afterMove(ctx) {
    const { move, captured, board, playerIdx } = ctx
    if (!captured) return
    if (captured.type === 'king') return
    board[move.from] = { type: captured.type, owner: playerIdx }
  },
}
