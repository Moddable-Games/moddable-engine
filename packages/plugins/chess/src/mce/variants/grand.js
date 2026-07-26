import MCE from '../engine.js';
MCE.registerVariant('grand', {
  group: 'Large Boards',
  openingBook: {
    "r8r/1nbqkcbn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCBN1/R8R w - -": ["e3e4", "d3d4", "f2f3", "c2c3"],
    "r8r/1nbqkcbn1/pppppppppp/10/10/10/4P5/PPPP1PPPPP/1NBQKCBN1/R8R b - -": ["e8e7", "d8d7", "f9f8"],
    "r8r/1nbqkcbn1/pppppppppp/10/10/10/3P6/PPP1PPPPPP/1NBQKCBN1/R8R b - -": ["d8d7", "e8e7", "g9f8"],
  },
  label: 'Grand Chess',
  group: 'Large Boards',
  rows: 10,
  cols: 10,
  fen: 'r8r/1nbqkcbn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCBN1/R8R w - - 0 1',
  promotionPieces: ['q', 'r', 'b', 'n', 'a', 'c'],
  pawnStartRow: function(side) { return side === 'w' ? 7 : 2; },
  title: 'Grand Chess',
  description: 'Same new pieces as Capablanca on a larger board. Pawns start on rank 3. No castling. Promotion only to previously captured pieces.',
  rule: 'Board: 10×10 · Win: Checkmate',
});
