import MCE from '../engine.js';
MCE.registerVariant('noCastling', {
  group: 'Classic',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3", "c2c4"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "c7c5", "e7e6", "d7d5"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "b1c3", "d2d4"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "e7e6"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["b8c6", "g8f6", "d7d6"],
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6": ["e4d5", "e4e5", "b1c3"],
  },
  label: 'No Castling',
  group: 'Classic',
  rows: 8,
  cols: 8,
  fen: null,
  noCastling: true,
  title: 'No Castling',
  description: 'Standard chess with castling disabled. Endorsed by Vladimir Kramnik and played in elite tournaments. Forces creative king safety solutions.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
