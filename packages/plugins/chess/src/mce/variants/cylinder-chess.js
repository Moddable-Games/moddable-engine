import MCE from '../engine.js';
MCE.registerVariant('cylinderChess', {
  label: 'Cylinder Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  wrapFiles: true,
  title: 'Cylinder Chess',
  description: 'The board wraps horizontally — the a-file connects to the h-file. Bishops and rooks can slide around the cylinder. Pawns can capture wrapping diagonally.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
