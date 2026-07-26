import MCE from '../engine.js';
MCE.registerVariant('halfChess', {
  label: 'Half Chess (4×8)',
  group: 'Alternate Rules',
  rows: 4,
  cols: 8,
  fen: 'rnbqkbnr/pppppppp/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  noEnPassant: true,
  title: 'Half Chess',
  description: 'A compressed 4-rank battlefield where armies start adjacent. No room to develop — every move is contact from the start. Pawns promote on the far rank.',
  rule: 'Board: 4×8 · Win: Checkmate',
});
