import MCE from '../engine.js';
MCE.registerVariant('singleCheck', {
  group: 'Tactical',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "g1f3", "d2d4"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e6", "c7c6", "d7d6", "g8f6"],
    "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -": ["d7d5", "e7e6", "c7c6"],
    "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d3", "g1f3", "b1c3"],
    "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d3", "g1f3", "b1c3"],
    "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d3", "b1c3", "e4e5"],
  },
  label: 'Single-Check',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  checkThreshold: 1,
  title: 'Single-Check',
  description: 'Deliver just one check to win instantly. Ultra-aggressive variant where every move is a potential game-ender. King safety is everything.',
  rule: 'Board: 8×8 · Win: One check',
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var oppKingSq = -1;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (p && MCE.pieceType(p) === 'k' && MCE.pieceColor(p) !== g.turn) {
        oppKingSq = i;
        break;
      }
    }
    var kingPressure = 0;
    if (oppKingSq >= 0) {
      var krc = MCE.rc(oppKingSq, g);
      for (var j = 0; j < g.board.length; j++) {
        var piece = g.board[j];
        if (!piece || MCE.pieceColor(piece) !== g.turn) continue;
        var prc = MCE.rc(j, g);
        var dist = Math.abs(prc[0] - krc[0]) + Math.abs(prc[1] - krc[1]);
        if (dist <= 2) kingPressure += 100;
        else if (dist <= 4) kingPressure += 30;
      }
    }
    return material + kingPressure;
  },
  winCondition: function(g) {
    if (g.checkCount.w >= 1) return 'checkmate';
    if (g.checkCount.b >= 1) return 'checkmate';
    return null;
  },
});
