import MCE from '../engine.js';
MCE.registerVariant('knightmate', {
  group: 'Alternate Rules',
  openingBook: {
    "rkbqnbkr/pppppppp/8/8/8/8/PPPPPPPP/RKBQNBKR w KQkq -": ["e2e4", "d2d4", "c2c4", "g2g3"],
    "rkbqnbkr/pppppppp/8/8/4P3/8/PPPP1PPP/RKBQNBKR b KQkq e3": ["e7e5", "d7d5", "c7c5"],
    "rkbqnbkr/pppppppp/8/8/3P4/8/PPP1PPPP/RKBQNBKR b KQkq d3": ["d7d5", "e7e6", "c7c5"],
    "rkbqnbkr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RKBQNBKR w KQkq e6": ["d2d4", "f1g3", "d1h5"],
    "rkbqnbkr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RKBQNBKR w KQkq d6": ["e4d5", "e4e5", "d2d3"],
  },
  label: 'Knightmate',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'rkbqnbkr/pppppppp/8/8/8/8/PPPPPPPP/RKBQNBKR w KQkq - 0 1',
  royalPiece: 'n',
  pieceRoles: { n: 'k', k: 'n' },
  title: 'Knightmate',
  description: 'The roles of king and knight are swapped. The knight is the royal piece that must be checkmated, while the king moves like a knight and is expendable.',
  rule: 'Board: 8×8 · Win: Checkmate knight',
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var myRoyalSq = -1, oppRoyalSq = -1;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if ((p === 'N' && g.turn === MCE.WHITE) || (p === 'n' && g.turn === MCE.BLACK)) myRoyalSq = i;
      if ((p === 'N' && g.turn === MCE.BLACK) || (p === 'n' && g.turn === MCE.WHITE)) oppRoyalSq = i;
    }
    var score = material;
    if (myRoyalSq >= 0) {
      var rc = MCE.rc(myRoyalSq, g);
      var edgeDist = Math.min(rc[0], 7 - rc[0], rc[1], 7 - rc[1]);
      score += edgeDist * 30;
    }
    if (oppRoyalSq >= 0) {
      var rc2 = MCE.rc(oppRoyalSq, g);
      var edgeDist2 = Math.min(rc2[0], 7 - rc2[0], rc2[1], 7 - rc2[1]);
      score -= edgeDist2 * 30;
    }
    return score;
  },
  winCondition: function(g) {
    var royalW = g.board.some(function(p) { return p === 'N'; });
    if (!royalW) return 'knightmate-b';
    var royalB = g.board.some(function(p) { return p === 'n'; });
    if (!royalB) return 'knightmate-w';
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('knightmate-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'knightmate-w' ? 'w' : 'b'))) + ' — royal knight captured!';
    }
    return null;
  },
});
