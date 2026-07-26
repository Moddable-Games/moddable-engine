import MCE from '../engine.js';
MCE.registerVariant('pawnsOnly', {
  label: 'Pawns Only',
  group: 'Asymmetric',
  rows: 8,
  cols: 8,
  fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1',
  noCastling: true,
  title: 'Pawns Only',
  description: 'Only pawns and kings on the board. First player to promote a pawn (or checkmate) wins. Simple to learn, surprisingly deep.',
  rule: 'Board: 8×8 · Win: Checkmate or promotion',
});
