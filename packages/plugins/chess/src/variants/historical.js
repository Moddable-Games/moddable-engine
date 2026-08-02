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
