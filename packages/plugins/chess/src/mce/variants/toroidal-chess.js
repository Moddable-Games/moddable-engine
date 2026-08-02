import MCE from '../engine.js';
MCE.registerVariant('toroidalChess', {
  label: 'Toroidal Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'pppppppp/rnbqkbnr/pppppppp/8/8/PPPPPPPP/RNBQKBNR/PPPPPPPP w - - 0 1',
  wrapFiles: true,
  wrapRanks: true,
  noCastling: true,
  noEnPassant: true,
  title: 'Toroidal Chess',
  description: 'Chess on a torus — all four edges wrap. No edge squares, no corners. Three-rank starting position with extra pawns.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
