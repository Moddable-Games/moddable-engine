import MCE from '../engine.js';
MCE.registerVariant('capablanca', {
  group: 'Large Boards',
  openingBook: {
    "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq -": ["e2e4", "d2d4", "g1f3", "c2c4", "i1h3"],
    "rnabqkbcnr/pppppppppp/10/10/4P5/10/PPPP1PPPPP/RNABQKBCNR b KQkq e3": ["e7e5", "d7d5", "c7c5", "g8f6"],
    "rnabqkbcnr/pppppppppp/10/10/3P6/10/PPP1PPPPPP/RNABQKBCNR b KQkq d3": ["d7d5", "g8f6", "e7e6"],
    "rnabqkbcnr/pppp1ppppp/10/4p5/4P5/10/PPPP1PPPPP/RNABQKBCNR w KQkq e6": ["g1f3", "i1h3", "b1c3"],
    "rnabqkbcnr/ppp1pppppp/10/3p6/4P5/10/PPPP1PPPPP/RNABQKBCNR w KQkq d6": ["e4d5", "e4e5", "b1c3"],
  },
  label: 'Capablanca',
  group: 'Large Boards',
  rows: 8,
  cols: 10,
  fen: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1',
  promotionPieces: ['q', 'r', 'b', 'n', 'a', 'c'],
  title: 'Capablanca Chess',
  description: 'Invented by world champion José Capablanca. Adds two new pieces: the Archbishop (bishop + knight) and Chancellor (rook + knight) on a wider board.',
  rule: 'Board: 10×8 · Win: Checkmate',
});
