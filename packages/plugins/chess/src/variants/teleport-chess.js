export const teleportChess = {
  key: 'teleportChess',
  slug: 'teleport-chess',

  initState(slice) {
    const board = slice.board
    const tokens = new Array(board.length).fill(false)
    for (let i = 0; i < board.length; i++) {
      const p = board[i]
      if (!p) continue
      if (p.type === 'pawn' || p.type === 'king') continue
      tokens[i] = true
    }
    slice._teleportTokens = tokens
  },

  actions: {
    teleport: {
      skipsCheckFilter: false,
      generate(slice, playerIdx, { allPositions, getCell, normalMoves }) {
        const tokens = slice._teleportTokens
        if (!tokens) return []
        const existing = new Set()
        if (normalMoves) {
          for (const m of normalMoves) existing.add(m.from + ':' + m.to)
        }
        const moves = []
        const empty = []
        for (const pos of allPositions()) {
          if (getCell(slice.board, pos) === null) empty.push(pos)
        }
        for (const pos of allPositions()) {
          if (!tokens[pos]) continue
          const piece = getCell(slice.board, pos)
          if (!piece || piece.owner !== playerIdx) continue
          for (const target of empty) {
            if (existing.has(pos + ':' + target)) continue
            moves.push({ action: 'teleport', from: pos, to: target })
          }
        }
        return moves
      },
      apply(move, { board, slice }) {
        const piece = board[move.from]
        board[move.from] = null
        board[move.to] = piece
        const tokens = [...slice._teleportTokens]
        tokens[move.from] = false
        tokens[move.to] = false
        return { board, halfmoveClock: 0, sliceKeys: { _teleportTokens: tokens } }
      },
    },
  },
}
