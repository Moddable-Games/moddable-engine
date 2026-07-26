import MCE from '../engine.js';
MCE.registerVariant('leganChess', {
  label: 'Legan Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR w - - 0 1',
  pawnMoveStyle: 'berolina',
  noCastling: true,
  noEnPassant: true,
  title: 'Legan Chess',
  description: 'Pawns move diagonally forward and capture straight forward (Berolina movement). The king and queen swap starting squares. No castling or en passant.',
  rule: 'Board: 8×8 · Win: Checkmate',
});
