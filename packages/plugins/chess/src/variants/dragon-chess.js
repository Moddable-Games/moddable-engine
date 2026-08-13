export const dragonChess = {
  key: 'dragon-chess',

  drops: true,

  initState(state) {
    state.hands = [['dragon', 'dragon'], ['dragon', 'dragon']]
  },

  actions: {
    drop: {
      generate(slice, playerIdx, { allPositions, getCell, config }) {
        if (!slice.hands) return []
        const hand = slice.hands[playerIdx]
        if (hand.length === 0) return []
        const cols = 8
        const backRankStart = playerIdx === 0 ? 56 : 0
        const moves = []
        for (let c = 0; c < cols; c++) {
          const pos = backRankStart + c
          if (getCell(slice.board, pos) !== null) continue
          moves.push({ action: 'drop', type: 'dragon', to: pos })
        }
        return moves
      },
      apply(move, { board, hands, playerIdx }) {
        board[move.to] = { type: move.type, owner: playerIdx }
        const idx = hands[playerIdx].indexOf(move.type)
        if (idx !== -1) hands[playerIdx].splice(idx, 1)
        return { board, hands }
      },
    },
  },
}
