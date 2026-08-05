export const crazyhouse = {
  key: 'crazyhouse',

  actions: {
    drop: {
      skipsCheckFilter: true,
      generate(slice, playerIdx, { allPositions, getCell, pawnConfig }) {
        if (!slice.hands) return []
        const hand = slice.hands[playerIdx]
        const uniqueTypes = [...new Set(hand)]
        const promoRows = pawnConfig ? pawnConfig.promotionCells[playerIdx] : new Set()
        const moves = []
        for (const type of uniqueTypes) {
          for (const pos of allPositions()) {
            if (getCell(slice.board, pos) !== null) continue
            if (type === 'pawn' && promoRows.has(pos)) continue
            moves.push({ action: 'drop', type, to: pos })
          }
        }
        return moves
      },
      apply(move, { board, hands, playerIdx }) {
        board[move.to] = { type: move.type, owner: playerIdx }
        const idx = hands[playerIdx].indexOf(move.type)
        if (idx !== -1) hands[playerIdx].splice(idx, 1)
        return { board, hands, halfmoveClock: 0 }
      },
    },
  },
}
