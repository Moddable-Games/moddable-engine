import MCE from '../engine.js';
MCE.registerVariant('losAlamos', {
  label: 'Los Alamos (6×6)',
  group: 'Small Boards',
  rows: 6,
  cols: 6,
  fen: 'rnqknr/pppppp/6/6/PPPPPP/RNQKNR w - - 0 1',
  noCastling: true,
  noEnPassant: true,
  pawnStartRow: function() { return -1; },
  title: 'Los Alamos Chess',
  description: 'The first chess variant ever played by a computer (1956). 6×6 board with no bishops, no castling, no double pawn step. Pure tactics.',
  rule: 'Board: 6×6 · Win: Checkmate',
});
