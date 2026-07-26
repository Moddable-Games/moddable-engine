import MCE from '../engine.js';
MCE.registerVariant('endgameChess', {
  label: 'Endgame Chess',
  group: 'Asymmetric',
  rows: 8,
  cols: 8,
  fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1',
  noCastling: true,
  title: 'Endgame Chess',
  description: 'Start with only pawns and kings — no back-rank pieces. Pure endgame technique from move one. Great for endgame practice.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
