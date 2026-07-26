import MCE from '../engine.js';
MCE.registerVariant('dianaChess', {
  label: 'Diana Chess (6×6)',
  group: 'Alternate Rules',
  rows: 6,
  cols: 6,
  fen: 'rbbkbr/pppppp/6/6/PPPPPP/RBBKBR w - - 0 1',
  noCastling: true,
  noEnPassant: true,
  title: 'Diana Chess',
  description: 'A 6×6 board with no queens or knights. Each side fields a king, two rooks, three bishops, and six pawns. Bishops dominate the diagonals.',
  rule: 'Board: 6×6 · Win: Checkmate',
});
