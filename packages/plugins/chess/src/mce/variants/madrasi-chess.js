import MCE from '../engine.js';
MCE.registerVariant('madrasiChess', {
  label: 'Madrasi Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Madrasi Chess',
  description: 'When two opposing pieces of the same type attack each other, both are paralysed and cannot move. Kings are exempt from paralysis.',
  rule: 'Board: 8×8 · Win: Checkmate',
  moveFilter: function(g, moves) {
    return moves.filter(function(m) {
      var piece = g.board[m.from];
      var type = MCE.pieceType(piece);
      if (type === 'k') return true;
      var side = MCE.pieceColor(piece);
      var enemy = side === MCE.WHITE ? MCE.BLACK : MCE.WHITE;
      var fromSq = m.from;
      var total = g.rows * g.cols;
      for (var i = 0; i < total; i++) {
        var ep = g.board[i];
        if (!ep || MCE.pieceColor(ep) !== enemy) continue;
        if (MCE.pieceType(ep) !== type) continue;
        var tempG = Object.assign({}, g, { turn: enemy });
        var eMoves = MCE.pseudoLegalMoves(tempG);
        for (var j = 0; j < eMoves.length; j++) {
          if (eMoves[j].from === i && eMoves[j].to === fromSq) {
            return false;
          }
        }
      }
      return true;
    });
  },
});
