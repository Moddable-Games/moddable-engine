import MCE from '../engine.js';
MCE.registerVariant('peasantsRevolt', {
  label: "Peasants' Revolt",
  group: 'Asymmetric',
  rows: 8,
  cols: 8,
  fen: '2n1k1n1/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1',
  noCastling: true,
  title: "Peasants' Revolt",
  description: 'Asymmetric: White has a king and 8 pawns against Black\'s king and 2 knights. Can the peasant army overwhelm the cavalry?',
  rule: 'Board: 8×8 · Win: Checkmate',
});
