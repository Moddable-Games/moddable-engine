import MCE from '../engine.js';
MCE.registerVariant('minichess', {
  label: 'Minichess (5×5)',
  group: 'Small Boards',
  rows: 5,
  cols: 5,
  fen: 'kqbnr/ppppp/5/PPPPP/RNBQK w - - 0 1',
  noCastling: true,
  noEnPassant: true,
  title: 'Minichess (5×5)',
  description: 'Gardner\'s Minichess — full piece types crammed onto a tiny 5×5 board. Fast, tactical, and surprisingly rich for its size.',
  rule: 'Board: 5×5 · Win: Checkmate',
});
