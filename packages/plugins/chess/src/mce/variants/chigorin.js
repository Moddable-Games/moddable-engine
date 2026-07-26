import MCE from '../engine.js';
MCE.registerVariant('chigorin', {
  group: 'Classic',
  label: 'Chigorin',
  group: 'Classic',
  rows: 8,
  cols: 8,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNNQKNNR w KQkq - 0 1',
  noCastling: true,
  title: 'Chigorin Chess',
  description: 'White has knights instead of bishops, Black has the standard army. Named after Mikhail Chigorin.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
