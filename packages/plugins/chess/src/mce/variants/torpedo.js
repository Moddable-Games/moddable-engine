import MCE from '../engine.js';
MCE.registerVariant('torpedo', {
  group: 'Classic',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "d7d5", "c7c5"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "f2f4", "d2d4"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["b8c6", "d7d6", "g8f6"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "f7f5"],
  },
  label: 'Torpedo',
  group: 'Classic',
  rows: 8,
  cols: 8,
  fen: null,
  torpedo: true,
  title: 'Torpedo Chess',
  description: 'Pawns can always move two squares forward, not just from their starting rank. Makes pawns far more dynamic and endgames completely different.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
