import MCE from '../engine.js';
MCE.registerVariant('toroidalChess', {
  label: 'Toroidal Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  wrapFiles: true,
  noCastling: true,
  noEnPassant: true,
  title: 'Toroidal Chess',
  description: 'The board wraps horizontally — the a-file and h-file are adjacent, forming a cylinder. Pieces can slide off one side and appear on the other. No castling or en passant.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
