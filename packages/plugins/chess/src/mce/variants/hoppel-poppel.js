import MCE from '../engine.js';
MCE.registerVariant('hoppelPoppel', {
  label: 'Hoppel-Poppel',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  divergentPieces: {
    n: { move: MCE.KNIGHT_OFFSETS, moveStyle: 'jump', capture: MCE.BISHOP_DIRS, captureStyle: 'slide' },
    b: { move: MCE.BISHOP_DIRS, moveStyle: 'slide', capture: MCE.KNIGHT_OFFSETS, captureStyle: 'jump' },
  },
  title: 'Hoppel-Poppel',
  description: 'Knights capture like bishops (sliding diagonally) and bishops capture like knights (jumping in L-shapes). Movement stays normal — only captures are swapped.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
