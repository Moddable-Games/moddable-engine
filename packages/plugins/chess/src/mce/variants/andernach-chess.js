import MCE from '../engine.js';
MCE.registerVariant('andernachChess', {
  label: 'Andernach',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Andernach Chess',
  description: 'When a piece makes a capture, it changes colour (switches sides). Kings are exempt from colour change. Standard check and checkmate rules apply.',
  rule: 'Board: 8×8 · Win: Checkmate',
  beforeMove: function(g, move, undo) {
    g.board[move.to] = undo.piece;
    g.board[move.from] = null;
    if (g.pieceData) {
      g.pieceData[move.to] = undo.pieceData || null;
      g.pieceData[move.from] = null;
    }
    if ((undo.captured || move.flag === 'ep') && MCE.pieceType(undo.piece) !== 'k') {
      var p = g.board[move.to];
      var flipped = (p === p.toUpperCase()) ? p.toLowerCase() : p.toUpperCase();
      MCE.mutateBoard(g, undo, [{ sq: move.to, piece: flipped }]);
    }
  },
  evaluate: function(g, defaultEval) {
    var VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    var score = 0;
    var myKingSq = -1, oppKingSq = -1;
    var myAttackers = 0;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      var color = MCE.pieceColor(p);
      var type = MCE.pieceType(p);
      var val = VALS[type] || 100;
      if (type === 'k') {
        if (color === g.turn) myKingSq = i;
        else oppKingSq = i;
        continue;
      }
      if (color === g.turn) {
        score += val;
        myAttackers++;
      } else {
        score -= val;
      }
    }
    if (oppKingSq >= 0 && myKingSq >= 0) {
      var kr = MCE.rc(myKingSq, g), or = MCE.rc(oppKingSq, g);
      var kDist = Math.abs(kr[0] - or[0]) + Math.abs(kr[1] - or[1]);
      score += myAttackers * (8 - kDist) * 5;
    }
    return score;
  },
});
