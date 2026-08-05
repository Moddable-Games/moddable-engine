const bareKingWin = (state) => {
  const board = state.board
  let wCount = 0, bCount = 0, wKing = false, bKing = false
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue
    if (board[i].owner === 0) { wCount++; if (board[i].type === 'king') wKing = true }
    else { bCount++; if (board[i].type === 'king') bKing = true }
  }
  if (!wKing) return 1
  if (!bKing) return 0
  if (wCount === 1 && wKing) return 1
  if (bCount === 1 && bKing) return 0
  return null
}

export const shatranj = {
  key: 'shatranj',
  winCondition: bareKingWin,
}

export const chaturanga = {
  key: 'chaturanga',
  winCondition: bareKingWin,
}

const SITTUYIN_PAWNS_W = [40,41,42,43,36,37,38,39]
const SITTUYIN_PAWNS_B = [24,25,26,27,20,21,22,23]

export const sittuyin = {
  key: 'sittuyin',

  setup() {
    const board = new Array(64).fill(null)
    for (const sq of SITTUYIN_PAWNS_W) board[sq] = { type: 'pawn', owner: 0 }
    for (const sq of SITTUYIN_PAWNS_B) board[sq] = { type: 'pawn', owner: 1 }
    return board
  },

  moveFilter(moves, state) {
    if (state.phase !== 'placement') return moves
    return moves.filter(m => m.action)
  },

  actions: {
    place: {
      skipsCheckFilter: true,
      continuesTurn: false,
      generate(slice, playerIdx) {
        if (slice.phase !== 'placement') return []
        const toPlace = slice._toPlace[playerIdx]
        if (!toPlace || toPlace.length === 0) return []
        const uniqueTypes = [...new Set(toPlace)]
        const backRank = playerIdx === 0 ? 7 : 0
        const dropRegion = playerIdx === 0
          ? [56,57,58,59,60,61,62,63, 48,49,50,51,52,53,54,55, 40,41,42,43,44,45,46,47]
          : [0,1,2,3,4,5,6,7, 8,9,10,11,12,13,14,15, 16,17,18,19,20,21,22,23]
        const moves = []
        for (const type of uniqueTypes) {
          for (const pos of dropRegion) {
            if (slice.board[pos] !== null) continue
            if (type === 'rook' && Math.floor(pos / 8) !== backRank) continue
            moves.push({ action: 'place', type, to: pos })
          }
        }
        return moves
      },
      apply(move, { board, slice, playerIdx }) {
        board[move.to] = { type: move.type, owner: playerIdx }
        const toPlace = [slice._toPlace[0].slice(), slice._toPlace[1].slice()]
        const idx = toPlace[playerIdx].indexOf(move.type)
        if (idx !== -1) toPlace[playerIdx].splice(idx, 1)
        const phase = (toPlace[0].length === 0 && toPlace[1].length === 0) ? 'play' : 'placement'
        return { board, sliceKeys: { _toPlace: toPlace, phase }, halfmoveClock: 0, fullmoveNumber: 1 }
      },
    },
  },
}
