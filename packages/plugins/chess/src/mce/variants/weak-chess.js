import MCE from '../engine.js';
MCE.registerVariant('weakChess', {
  label: 'Weak! Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Weak! Chess',
  description: 'The weakest piece type that has a legal move MUST move. Piece strength: Pawn=1, Knight=2, Bishop=3, Rook=4, Queen=5, King=6.',
  rule: 'Board: 8×8 · Win: Checkmate',
  promotionPieces: ['q', 'r', 'b', 'n'],
  moveFilter: function(g, moves) {
    var strength = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    var minStrength = 7;
    for (var i = 0; i < moves.length; i++) {
      var piece = g.board[moves[i].from];
      var s = strength[MCE.pieceType(piece)] || 6;
      if (s < minStrength) minStrength = s;
    }
    return moves.filter(function(m) {
      var piece = g.board[m.from];
      var s = strength[MCE.pieceType(piece)] || 6;
      return s === minStrength;
    });
  },
});
