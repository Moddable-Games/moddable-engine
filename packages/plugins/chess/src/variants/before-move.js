export const rifle = {
  key: 'rifle',

  moveApply({ move, board, piece, setCell, getCell }) {
    const target = getCell(board, move.to)
    if (target || move.enPassant) {
      if (target) setCell(board, move.to, null)
      if (move.enPassant && move.captured !== undefined) setCell(board, move.captured, null)
    } else {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
    }
  },
}

export const atomic = {
  key: 'atomic',
  noCheck: true,

  moveApply({ move, board, piece, playerIdx, topology, setCell, getCell }) {
    const target = getCell(board, move.to)
    if (target && !move.enPassant) {
      setCell(board, move.to, null)
      setCell(board, move.from, null)
      const cols = topology ? topology.cols : 8
      const rows = board.length / cols
      const r = Math.floor(move.to / cols), c = move.to % cols
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
          const sq = nr * cols + nc
          const p = getCell(board, sq)
          if (p && p.type !== 'pawn') setCell(board, sq, null)
        }
      }
    } else if (move.enPassant) {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
      if (move.captured !== undefined) setCell(board, move.captured, null)
    } else {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
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
    if (!whiteKing && !blackKing) return 'draw'
    if (!whiteKing) return 'black'
    if (!blackKing) return 'white'
    return null
  },
}

export const displacementChess = {
  key: 'displacementChess',

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
