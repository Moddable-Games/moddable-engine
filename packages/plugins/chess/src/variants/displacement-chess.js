export const displacementChess = {
  key: 'displacementChess',
  slug: 'displacement-chess',

  moveFilter(moves, state, ctx) {
    const board = state.board
    const playerIdx = ctx.currentPlayer
    const cols = 8
    const rows = board.length / cols
    const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    for (let i = 0; i < board.length; i++) {
      const p = board[i]
      if (!p || p.owner !== playerIdx) continue
      const r = Math.floor(i / cols), c = i % cols
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        const target = nr * cols + nc
        if (target <= i) continue
        if (!board[target] || board[target].owner !== playerIdx) continue
        moves.push({ from: i, to: target, swap: true })
      }
    }
    return moves
  },

  moveApply({ move, board, setCell, getCell }) {
    if (move.swap) {
      const a = getCell(board, move.from)
      const b = getCell(board, move.to)
      setCell(board, move.from, b)
      setCell(board, move.to, a)
    } else {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
    }
  },
}
