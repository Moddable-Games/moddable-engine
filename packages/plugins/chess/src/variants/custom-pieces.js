export const almostChess = {
  key: 'almostChess',
  setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBCKBNR',
  pieces: {
    chancellor: { type: 'compose', parts: ['rook', 'knight'] },
  },
  vocabulary: {
    chancellor: { symbols: { 0: 'C', 1: 'c' } },
  },
}

export const amazonChess = {
  key: 'amazonChess',
  setup: 'rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR',
  promotionChoices: ['amazon', 'rook', 'bishop', 'knight'],
  pieces: {
    amazon: { type: 'compose', parts: ['queen', 'knight'] },
  },
  vocabulary: {
    amazon: { symbols: { 0: 'M', 1: 'm' } },
  },
}

export const grand = {
  key: 'grand',
  rows: 10,
  cols: 10,
  setup: 'r8r/1nbqkcbn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCBN1/R8R',
  promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'archbishop', 'chancellor'],
  castling: false,
  pawnStartRow: { 0: 7, 1: 2 },
  pieces: {
    chancellor: { type: 'compose', parts: ['rook', 'knight'] },
    archbishop: { type: 'compose', parts: ['bishop', 'knight'] },
  },
  vocabulary: {
    chancellor: { symbols: { 0: 'C', 1: 'c' } },
    archbishop: { symbols: { 0: 'A', 1: 'a' } },
  },
}

export const knightmate = {
  key: 'knightmate',
  setup: 'rkbqnbkr/pppppppp/8/8/8/8/PPPPPPPP/RKBQNBKR',
  royalType: 'knight',
  pieces: {
    king: { type: 'leaper', offsets: 'knight' },
    knight: { type: 'rider', dirs: 'all', maxSteps: 1, royal: true },
  },
}

export const maharaja = {
  key: 'maharaja',
  setup: 'rnbqkbnr/pppppppp/8/8/8/8/8/4M3',
  castling: false,
  pieces: {
    amazon: { type: 'compose', parts: ['queen', 'knight'] },
  },
  vocabulary: {
    amazon: { symbols: { 0: 'M', 1: 'm' } },
  },
  winCondition(state, ctx) {
    const board = state.board
    let hasMaharaja = false
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].type === 'amazon' && board[i].owner === 0) {
        hasMaharaja = true
        break
      }
    }
    if (!hasMaharaja) return 1
    return null
  },
}

export const ordaChess = {
  key: 'ordaChess',
  setup: 'lhwykwhl/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR',
  castling: false,
  pieces: {
    yurt: {
      divergent: {
        move: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
        capture: { type: 'leaper', offsets: [[1, 0], [-1, 0], [0, 1], [0, -1]] },
      },
    },
    lancer: {
      divergent: {
        move: { type: 'leaper', offsets: 'knight' },
        capture: { type: 'rider', dirs: 'orthogonal' },
      },
    },
    archer: {
      divergent: {
        move: { type: 'leaper', offsets: 'knight' },
        capture: { type: 'rider', dirs: 'diagonal' },
      },
    },
    kheshig: { type: 'compose', parts: ['knight', { type: 'rider', dirs: 'all', maxSteps: 1 }] },
  },
  vocabulary: {
    yurt: { symbols: { 0: 'Y', 1: 'y' } },
    lancer: { symbols: { 0: 'L', 1: 'l' } },
    archer: { symbols: { 0: 'H', 1: 'h' } },
    kheshig: { symbols: { 0: 'W', 1: 'w' } },
  },
}

export const hoppelPoppel = {
  key: 'hoppelPoppel',
  pieces: {
    knight: {
      divergent: {
        move: { type: 'leaper', offsets: 'knight' },
        capture: { type: 'rider', dirs: 'diagonal' },
      },
    },
    bishop: {
      divergent: {
        move: { type: 'rider', dirs: 'diagonal' },
        capture: { type: 'leaper', offsets: 'knight' },
      },
    },
  },
}

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
