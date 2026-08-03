export const ordaMirror = {
  key: 'ordaMirror',
  rows: 8,
  cols: 8,
  setup: 'lhwykwhl/pppppppp/8/8/8/8/PPPPPPPP/LHWYKWHL',
  castling: false,
  pieces: {
    yurt: {
      divergent: {
        move: { type: 'leaper', offsets: 'knight' },
        capture: { type: 'rider', dirs: 'all' },
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

export const janus = {
  key: 'janus',
  rows: 8,
  cols: 10,
  setup: 'rjnbkqbnjr/pppppppppp/10/10/10/10/PPPPPPPPPP/RJNBKQBNJR',
  promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'janus'],
  pieces: {
    janus: { type: 'compose', parts: ['bishop', 'knight'] },
  },
  vocabulary: {
    janus: { symbols: { 0: 'J', 1: 'j' } },
  },
}

export const chancellorChess = {
  key: 'chancellorChess',
  rows: 9,
  cols: 9,
  setup: 'rnbqkcbnr/ppppppppp/9/9/9/9/9/PPPPPPPPP/RNBQKCBNR',
  promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'chancellor'],
  pieces: {
    chancellor: { type: 'compose', parts: ['rook', 'knight'] },
  },
  vocabulary: {
    chancellor: { symbols: { 0: 'C', 1: 'c' } },
  },
}

export const carrera = {
  key: 'carrera',
  rows: 8,
  cols: 10,
  setup: 'rAnbqkbnCr/pppppppppp/10/10/10/10/PPPPPPPPPP/RANBQKBNCR',
  castling: false,
  enPassant: false,
  promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'centaur', 'champion'],
  pieces: {
    centaur: { type: 'compose', parts: ['bishop', 'knight'] },
    champion: { type: 'compose', parts: ['rook', 'knight'] },
  },
  vocabulary: {
    centaur: { symbols: { 0: 'A', 1: 'a' } },
    champion: { symbols: { 0: 'C', 1: 'c' } },
  },
}

export const birdsChess = {
  key: 'birdsChess',
  rows: 8,
  cols: 10,
  setup: 'rnbgqkebnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBGQKEBNR',
  promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'guard', 'equerry'],
  pieces: {
    guard: { type: 'compose', parts: ['rook', 'knight'] },
    equerry: { type: 'compose', parts: ['bishop', 'knight'] },
  },
  vocabulary: {
    guard: { symbols: { 0: 'G', 1: 'g' } },
    equerry: { symbols: { 0: 'E', 1: 'e' } },
  },
}

export const wildebeest = {
  key: 'wildebeest',
  rows: 10,
  cols: 11,
  setup: 'rncwqkwcnr1/ppppppppppp/11/11/11/11/11/11/PPPPPPPPPPP/RNCWQKWCNR1',
  promotionChoices: ['queen', 'rook', 'knight', 'camel', 'wildebeest'],
  pieces: {
    camel: { type: 'leaper', offsets: 'camel' },
    wildebeest: { type: 'compose', parts: ['knight', { type: 'leaper', offsets: 'camel' }] },
  },
  vocabulary: {
    camel: { symbols: { 0: 'C', 1: 'c' } },
    wildebeest: { symbols: { 0: 'W', 1: 'w' } },
  },
}

export const shatranjKamil = {
  key: 'shatranjKamil',
  rows: 10,
  cols: 10,
  setup: 'rndbqkbdnr/pppppppppp/10/10/10/10/10/10/PPPPPPPPPP/RNDBQKBDNR',
  castling: false,
  enPassant: false,
  stalemateMeaning: 'loss',
  pieces: {
    dabbaba: { type: 'leaper', offsets: 'dabbaba' },
  },
  vocabulary: {
    dabbaba: { symbols: { 0: 'D', 1: 'd' } },
  },
}

export const nightrider = {
  key: 'nightrider',
  rows: 8,
  cols: 8,
  setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
  pieces: {
    knight: { type: 'rider', dirs: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] },
  },
}

export const hexapawn = {
  key: 'hexapawn',
  rows: 3,
  cols: 3,
  setup: 'ppp/3/PPP',
  castling: false,
  enPassant: false,
  noCheck: true,
  stalemateMeaning: 'loss',
  winCondition(state, ctx) {
    const board = state.board
    for (let c = 0; c < 3; c++) {
      if (board[c] && board[c].type === 'pawn' && board[c].owner === 0) return 0
      if (board[6 + c] && board[6 + c].type === 'pawn' && board[6 + c].owner === 1) return 1
    }
    return null
  },
}

export const oblongChess = {
  key: 'oblongChess',
  rows: 16,
  cols: 4,
  setup: 'rnbk/pppp/4/4/4/4/4/4/4/4/4/4/4/4/PPPP/KBNR',
  castling: false,
  enPassant: false,
  noCheck: true,
  stalemateMeaning: 'loss',
}
