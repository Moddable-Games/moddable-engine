import MCE from '../engine.js';
MCE.registerVariant('pettyChess', {
  label: 'Petty Chess (5×6)',
  group: 'Alternate Rules',
  rows: 5,
  cols: 6,
  fen: 'qnbknr/pppppp/6/PPPPPP/RNKBNQ w - - 0 1',
  noCastling: true,
  title: 'Petty Chess',
  description: 'A compact 5×6 variant with all piece types. The reduced board means quick engagements and minimal development phase.',
  rule: 'Board: 5×6 · Win: Checkmate',
});
