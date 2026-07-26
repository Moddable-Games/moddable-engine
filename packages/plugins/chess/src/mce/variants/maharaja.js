import MCE from '../engine.js';
MCE.registerVariant('maharaja', {
  label: 'Maharaja & Sepoys',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/8/4M3 w kq - 0 1',
  noCastling: true,
  title: 'Maharaja & Sepoys',
  description: 'Extreme asymmetry — White has only a Maharaja (Queen + Knight compound piece) against Black\'s full army. The Maharaja must checkmate Black\'s king alone.',
  rule: 'Board: 8×8 · Win: Checkmate',
  evaluate: function(g, defaultEval) {
    var maharajaSq = -1;
    var blackMaterial = 0;
    var VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (p === 'M') maharajaSq = i;
      else if (MCE.pieceColor(p) === MCE.BLACK) {
        blackMaterial += VALS[MCE.pieceType(p)] || 100;
      }
    }
    if (maharajaSq === -1) return g.turn === MCE.WHITE ? -100000 : 100000;
    var score;
    if (g.turn === MCE.WHITE) {
      score = 5000 - blackMaterial;
      var rc = MCE.rc(maharajaSq, g);
      var centerDist = Math.abs(rc[0] - 3.5) + Math.abs(rc[1] - 3.5);
      score += (7 - centerDist) * 40;
    } else {
      score = blackMaterial - 5000;
      var rc2 = MCE.rc(maharajaSq, g);
      var centerDist2 = Math.abs(rc2[0] - 3.5) + Math.abs(rc2[1] - 3.5);
      score -= (7 - centerDist2) * 40;
    }
    return score;
  },
  winCondition: function(g) {
    var hasM = g.board.some(function(p) { return p === 'M'; });
    if (!hasM) return 'maharaja-b';
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    if (helpers.variantStatus === 'maharaja-b') {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor('b'))) + ' — Maharaja captured!';
    }
    return null;
  },
});
