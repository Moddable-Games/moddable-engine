import MCE from '../engine.js';

MCE.registerVariant('ordaChess', {
  label: 'Orda Chess',
  group: 'Asymmetric',
  rows: 8,
  cols: 8,
  fen: 'lhwykwhl/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR w KQ - 0 1',
  noCastling: false,
  title: 'Orda Chess',
  description: 'Asymmetric: White plays standard chess. Black commands the Horde — Yurt (moves diagonal, captures orthogonal), Lancer (moves like knight, captures like rook), Archer (moves like knight, captures like bishop), Kheshig (moves as king or knight).',
  rule: 'Board: 8×8 · Win: Checkmate',
  pieceRoles: { y: 'y', l: 'l', h: 'h', w: 'w' },
});
