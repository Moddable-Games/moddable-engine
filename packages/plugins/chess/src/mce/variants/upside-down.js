import MCE from '../engine.js';
MCE.registerVariant('upsideDown', {
  group: 'Classic',
  label: 'Upside-Down',
  rows: 8,
  cols: 8,
  fen: 'RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr w KQkq - 0 1',
  pawnStartRow: function(side) { return side === 'w' ? 1 : 6; },
  title: 'Upside-Down Chess',
  description: 'Pieces start on the opponent\'s back rank. Pawns move normally — one step from promotion. Instant tactical chaos.',
  rule: 'Board: 8×8 · Win: Checkmate · Castling available',
});
