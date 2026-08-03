const bareKingWin = (state) => {
  const board = state.board
  let wCount = 0, bCount = 0, wKing = false, bKing = false
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue
    if (board[i].owner === 0) { wCount++; if (board[i].type === 'king') wKing = true }
    else { bCount++; if (board[i].type === 'king') bKing = true }
  }
  if (!wKing) return 'black'
  if (!bKing) return 'white'
  if (wCount === 1 && wKing) return 'black'
  if (bCount === 1 && bKing) return 'white'
  return null
}

export const shatranj = {
  key: 'shatranj',
  setup: 'rnekfenr/pppppppp/8/8/8/8/PPPPPPPP/RNEKFENR',
  castling: false,
  enPassant: false,
  doubleStep: false,
  stalemateMeaning: 'win',
  promotionChoices: ['ferz'],
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    alfil: { type: 'leaper', offsets: [[-2, -2], [-2, 2], [2, -2], [2, 2]] },
  },
  vocabulary: {
    ferz: { symbols: { 0: 'F', 1: 'f' } },
    alfil: { symbols: { 0: 'E', 1: 'e' } },
  },
  winCondition: bareKingWin,
}

export const chaturanga = {
  key: 'chaturanga',
  setup: 'rnefkenr/pppppppp/8/8/8/8/PPPPPPPP/RNEFKENR',
  castling: false,
  enPassant: false,
  doubleStep: false,
  stalemateMeaning: 'win',
  promotionChoices: ['ferz'],
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    alfil: { type: 'leaper', offsets: [[-2, -2], [-2, 2], [2, -2], [2, 2]] },
  },
  vocabulary: {
    ferz: { symbols: { 0: 'F', 1: 'f' } },
    alfil: { symbols: { 0: 'E', 1: 'e' } },
  },
  winCondition: bareKingWin,
}

export const makruk = {
  key: 'makruk',
  setup: 'rngkfgnr/8/pppppppp/8/8/PPPPPPPP/8/RNGKFGNR',
  castling: false,
  enPassant: false,
  doubleStep: false,
  promotionChoices: ['ferz'],
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    khon: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], directional: true },
  },
  vocabulary: {
    ferz: { symbols: { 0: 'F', 1: 'f' } },
    khon: { symbols: { 0: 'G', 1: 'g' } },
  },
  pawnConfig: {
    forwardDir: { 0: [-1, 0], 1: [1, 0] },
    startCells: { 0: new Set([40,41,42,43,44,45,46,47]), 1: new Set([16,17,18,19,20,21,22,23]) },
    promotionCells: { 0: new Set([16,17,18,19,20,21,22,23]), 1: new Set([40,41,42,43,44,45,46,47]) },
    captureDirections: { 0: [[-1, -1], [-1, 1]], 1: [[1, -1], [1, 1]] },
    doubleStep: false,
  },
}


export const courier = {
  key: 'courier',
  rows: 8,
  cols: 12,
  setup: 'rnebdkftbenr/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNEBDKFTBENR',
  castling: false,
  enPassant: false,
  doubleStep: false,
  promotionChoices: ['ferz'],
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    alfil: { type: 'leaper', offsets: [[-2, -2], [-2, 2], [2, -2], [2, 2]] },
    mann: { type: 'rider', dirs: 'all', maxSteps: 1 },
    schleich: { type: 'leaper', offsets: [[-1, 0], [1, 0], [0, -1], [0, 1]] },
  },
  vocabulary: {
    ferz: { symbols: { 0: 'F', 1: 'f' } },
    alfil: { symbols: { 0: 'E', 1: 'e' } },
    mann: { symbols: { 0: 'D', 1: 'd' } },
    schleich: { symbols: { 0: 'T', 1: 't' } },
  },
}

const SITTUYIN_PAWNS_W = [40,41,42,43,36,37,38,39]
const SITTUYIN_PAWNS_B = [24,25,26,27,20,21,22,23]

export const sittuyin = {
  key: 'sittuyin',
  castling: false,
  enPassant: false,
  doubleStep: false,
  promotionChoices: ['ferz'],
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    khon: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], directional: true },
  },
  vocabulary: {
    ferz: { symbols: { 0: 'F', 1: 'f' } },
    khon: { symbols: { 0: 'G', 1: 'g' } },
  },
  placementPieces: [
    ['rook', 'rook', 'knight', 'knight', 'khon', 'khon', 'ferz', 'king'],
    ['rook', 'rook', 'knight', 'knight', 'khon', 'khon', 'ferz', 'king'],
  ],
  setup() {
    const board = new Array(64).fill(null)
    for (const sq of SITTUYIN_PAWNS_W) board[sq] = { type: 'pawn', owner: 0 }
    for (const sq of SITTUYIN_PAWNS_B) board[sq] = { type: 'pawn', owner: 1 }
    return board
  },

  moveFilter(moves, state) {
    if (state._phase !== 'placement') return moves
    return moves.filter(m => m.action)
  },


  actions: {
    place: {
      skipsCheckFilter: true,
      continuesTurn: false,
      generate(slice, playerIdx) {
        if (slice._phase !== 'placement') return []
        const toPlace = slice._toPlace[playerIdx]
        if (!toPlace || toPlace.length === 0) return []
        const type = toPlace[0]
        const backRank = playerIdx === 0 ? 7 : 0
        const dropRegion = playerIdx === 0
          ? [56,57,58,59,60,61,62,63, 48,49,50,51,52,53,54,55, 40,41,42,43,44,45,46,47]
          : [0,1,2,3,4,5,6,7, 8,9,10,11,12,13,14,15, 16,17,18,19,20,21,22,23]
        const moves = []
        for (const pos of dropRegion) {
          if (slice.board[pos] !== null) continue
          if (type === 'rook' && Math.floor(pos / 8) !== backRank) continue
          moves.push({ action: 'place', type, to: pos })
        }
        return moves
      },
      apply(move, { board, slice, playerIdx }) {
        board[move.to] = { type: move.type, owner: playerIdx }
        const toPlace = [slice._toPlace[0].slice(), slice._toPlace[1].slice()]
        const idx = toPlace[playerIdx].indexOf(move.type)
        if (idx !== -1) toPlace[playerIdx].splice(idx, 1)
        const phase = (toPlace[0].length === 0 && toPlace[1].length === 0) ? 'play' : 'placement'
        return { board, sliceKeys: { _toPlace: toPlace, _phase: phase }, halfmoveClock: 0, fullmoveNumber: 1 }
      },
    },
  },
}
