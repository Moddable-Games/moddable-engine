import MCE from '../engine.js';
MCE.registerVariant('almostChess', {
  group: 'Classic',
  label: 'Almost Chess',
  group: 'Classic',
  rows: 8,
  cols: 8,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBCKBNR w KQkq - 0 1',
  title: 'Almost Chess',
  description: 'Identical to standard chess except one queen is replaced by a Chancellor (Rook + Knight compound). Subtle but significant strategic shift.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
