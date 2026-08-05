export const benedictChess = {
  key: 'benedictChess',

  moveFilter(moves, state, ctx) {
    const board = state.board
    return moves.filter(m => board[m.to] === null)
  },

  afterMove(ctx) {
    const { move, board, playerIdx, topology } = ctx
    const piece = board[move.to]
    if (!piece) return
    const owner = piece.owner
    const opponent = 1 - owner
    const cols = topology ? topology.cols : 8
    const rows = board.length / cols
    const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    const r = Math.floor(move.to / cols), c = move.to % cols

    const attacked = new Set()
    if (piece.type === 'queen' || piece.type === 'rook') {
      for (const [dr, dc] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        let nr = r + dr, nc = c + dc
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const sq = nr * cols + nc
          if (board[sq]) { attacked.add(sq); break }
          nr += dr; nc += dc
        }
      }
    }
    if (piece.type === 'queen' || piece.type === 'bishop') {
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let nr = r + dr, nc = c + dc
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const sq = nr * cols + nc
          if (board[sq]) { attacked.add(sq); break }
          nr += dr; nc += dc
        }
      }
    }
    if (piece.type === 'knight') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          attacked.add(nr * cols + nc)
        }
      }
    }
    if (piece.type === 'rook' || piece.type === 'queen' || piece.type === 'bishop' || piece.type === 'knight') {
      // already handled above
    } else if (piece.type === 'king') {
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          attacked.add(nr * cols + nc)
        }
      }
    } else if (piece.type === 'pawn') {
      const fwd = owner === 0 ? -1 : 1
      for (const dc of [-1, 1]) {
        const nr = r + fwd, nc = c + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          attacked.add(nr * cols + nc)
        }
      }
    }

    for (const sq of attacked) {
      const target = board[sq]
      if (target && target.owner === opponent) {
        board[sq] = { type: target.type, owner }
      }
    }
  },

  winCondition(state, ctx) {
    const board = state.board
    let whiteKing = false, blackKing = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].type === 'king') {
        if (board[i].owner === 0) whiteKing = true
        else blackKing = true
      }
    }
    if (!whiteKing) return 1
    if (!blackKing) return 0
    return null
  },
}
