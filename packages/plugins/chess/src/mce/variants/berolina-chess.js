import MCE from '../engine.js';
MCE.registerVariant('berolinaChess', {
  label: 'Berolina Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  pawnMoveStyle: 'berolina',
  title: 'Berolina Chess',
  description: 'Pawns move diagonally forward and capture straight forward — the inverse of normal pawns. Named after Berlin where it was invented in 1926.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
