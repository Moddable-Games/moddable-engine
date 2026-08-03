export const berolinaChess = {
  key: 'berolinaChess',
  pawnConfig: {
    forwardDir: { 0: [-1, 0], 1: [1, 0] },
    startCells: { 0: new Set([48, 49, 50, 51, 52, 53, 54, 55]), 1: new Set([8, 9, 10, 11, 12, 13, 14, 15]) },
    promotionCells: { 0: new Set([0, 1, 2, 3, 4, 5, 6, 7]), 1: new Set([56, 57, 58, 59, 60, 61, 62, 63]) },
    captureDirections: { 0: [[-1, 0]], 1: [[1, 0]] },
    moveDirections: { 0: [[-1, -1], [-1, 1]], 1: [[1, -1], [1, 1]] },
    doubleStep: true,
  },
}

export const leganChess = {
  key: 'leganChess',
  setup: 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR',
  castling: false,
  enPassant: false,
  pawnConfig: {
    forwardDir: { 0: [-1, 0], 1: [1, 0] },
    startCells: { 0: new Set([48, 49, 50, 51, 52, 53, 54, 55]), 1: new Set([8, 9, 10, 11, 12, 13, 14, 15]) },
    promotionCells: { 0: new Set([0, 1, 2, 3, 4, 5, 6, 7]), 1: new Set([56, 57, 58, 59, 60, 61, 62, 63]) },
    captureDirections: { 0: [[-1, 0]], 1: [[1, 0]] },
    moveDirections: { 0: [[-1, -1], [-1, 1]], 1: [[1, -1], [1, 1]] },
    doubleStep: true,
  },
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
    startCells: { 0: new Set([40, 41, 42, 43, 44, 45, 46, 47]), 1: new Set([16, 17, 18, 19, 20, 21, 22, 23]) },
    promotionCells: { 0: new Set([16, 17, 18, 19, 20, 21, 22, 23]), 1: new Set([40, 41, 42, 43, 44, 45, 46, 47]) },
    captureDirections: { 0: [[-1, -1], [-1, 1]], 1: [[1, -1], [1, 1]] },
    doubleStep: false,
  },
}
