export const chigorin = {
  key: 'chigorin',
  setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNNQKNNR',
  castling: false,
}

export const endgameChess = {
  key: 'endgameChess',
  setup: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3',
  castling: false,
}

export const pawnsOnly = {
  key: 'pawnsOnly',
  setup: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3',
  castling: false,
}

export const peasantsRevolt = {
  key: 'peasantsRevolt',
  setup: '2n1k1n1/pppppppp/8/8/8/8/PPPPPPPP/4K3',
  castling: false,
}


export const halfChess = {
  key: 'halfChess',
  rows: 4,
  setup: 'rnbqkbnr/pppppppp/PPPPPPPP/RNBQKBNR',
  enPassant: false,
}

export const minichess = {
  key: 'minichess',
  rows: 5,
  cols: 5,
  setup: 'kqbnr/ppppp/5/PPPPP/RNBQK',
  castling: false,
  enPassant: false,
}

export const dianaChess = {
  key: 'dianaChess',
  rows: 6,
  cols: 6,
  setup: 'rbbkbr/pppppp/6/6/PPPPPP/RBBKBR',
  castling: false,
  enPassant: false,
}

export const pettyChess = {
  key: 'pettyChess',
  rows: 5,
  cols: 6,
  setup: 'qnbknr/pppppp/6/PPPPPP/RNKBNQ',
  castling: false,
}

export const upsideDown = {
  key: 'upsideDown',
  setup: 'RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr',
  pawnStartRow: { 0: 1, 1: 6 },
}
