const KNIGHT_OFFSETS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]

export const oukChaktrang = {
  key: 'ouk-chaktrang',

  initState(slice) {
    slice._kingLeapUsed = { 0: false, 1: false }
  },

  afterMove({ move, playerIdx, piece, setSlice, slice }) {
    if (piece && piece.type === 'king' && !slice._kingLeapUsed[playerIdx]) {
      setSlice('_kingLeapUsed', { ...slice._kingLeapUsed, [playerIdx]: true })
    }
  },

  actions: {
    kingLeap: {
      skipsCheckFilter: false,
      generate(slice, playerIdx, { allPositions, getCell, topology }) {
        if (!slice._kingLeapUsed || slice._kingLeapUsed[playerIdx]) return []
        let kingPos = -1
        for (const pos of allPositions()) {
          const cell = getCell(slice.board, pos)
          if (cell && cell.type === 'king' && cell.owner === playerIdx) {
            kingPos = pos
            break
          }
        }
        if (kingPos === -1) return []
        const moves = []
        for (const offset of KNIGHT_OFFSETS) {
          const target = topology.step(kingPos, offset)
          if (target === null) continue
          const occupant = getCell(slice.board, target)
          if (occupant && occupant.owner === playerIdx) continue
          moves.push({ action: 'kingLeap', from: kingPos, to: target })
        }
        return moves
      },
      apply(move, { board, slice, playerIdx }) {
        const captured = board[move.to]
        board[move.to] = board[move.from]
        board[move.from] = null
        const used = { ...slice._kingLeapUsed, [playerIdx]: true }
        return { board, halfmoveClock: captured ? 0 : undefined, sliceKeys: { _kingLeapUsed: used } }
      },
    },
  },
}
