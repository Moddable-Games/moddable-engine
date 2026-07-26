import MCE from '../engine.js';
MCE.registerVariant('codrus', {
  label: 'Codrus',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  noCastling: true,
  noCheck: true,
  title: 'Codrus',
  description: 'Named after the Athenian king who sacrificed himself. Lose your king to win. No check concept — you must arrange for your own king to be captured.',
  rule: 'Board: 8×8 · Win: Lose your king',
  evaluate: function(g) {
    var myKingSq = -1, oppKingSq = -1;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (p && MCE.pieceType(p) === 'k') {
        if (MCE.pieceColor(p) === g.turn) myKingSq = i;
        else oppKingSq = i;
      }
    }
    if (myKingSq === -1) return 100000;
    if (oppKingSq === -1) return -100000;
    var score = 0;
    var rc = MCE.rc(myKingSq, g);
    var centerDist = Math.abs(rc[0] - 3.5) + Math.abs(rc[1] - 3.5);
    score += (7 - centerDist) * 80;
    for (var j = 0; j < g.board.length; j++) {
      var piece = g.board[j];
      if (!piece || MCE.pieceColor(piece) === g.turn) continue;
      var prc = MCE.rc(j, g);
      var dist = Math.abs(prc[0] - rc[0]) + Math.abs(prc[1] - rc[1]);
      if (dist <= 2) score += 150;
    }
    return score;
  },
  winCondition: function(g) {
    var hasWhiteK = g.board.some(function(p) { return p === 'K'; });
    if (!hasWhiteK) return 'codrus-w';
    var hasBlackK = g.board.some(function(p) { return p === 'k'; });
    if (!hasBlackK) return 'codrus-b';
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('codrus-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'codrus-w' ? 'w' : 'b'))) + ' — sacrificed their king!';
    }
    return null;
  },
});
