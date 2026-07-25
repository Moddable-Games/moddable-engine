export const capablanca = {
  key: 'capablanca',
  label: 'Capablanca',
  group: 'Large Boards',
  title: 'Capablanca Chess',
  description: 'Adds Archbishop (bishop+knight) and Chancellor (rook+knight) on a 10x8 board.',
  rule: 'Board: 10x8 · Win: Checkmate',
  rows: 8,
  cols: 10,
  setup: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR',
  promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'archbishop', 'chancellor'],
  pieces: {
    archbishop: { type: 'compose', parts: ['bishop', 'knight'] },
    chancellor: { type: 'compose', parts: ['rook', 'knight'] },
  },
  vocabulary: {
    archbishop: { symbols: { 0: 'A', 1: 'a' } },
    chancellor: { symbols: { 0: 'C', 1: 'c' } },
  },
  openingBook: {
    'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq -': ['e2e4', 'd2d4', 'g1f3'],
  },
}
