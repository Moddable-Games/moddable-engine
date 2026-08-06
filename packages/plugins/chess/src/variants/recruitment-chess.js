export const recruitmentChess = {
  key: 'recruitmentChess',

  afterMove(ctx) {
    const { move, captured, board, playerIdx } = ctx
    if (!captured) return
    if (captured.type === 'king') return
    board[move.from] = { type: captured.type, owner: playerIdx }
  },
}
