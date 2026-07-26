import MCE from '../engine.js';
MCE.registerVariant('extinction', {
  group: 'Tactical',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3", "b1c3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "d7d5", "g8f6", "b8c6"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "e7e6"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "b1c3", "f1c4"],
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6": ["e4e5", "b1c3", "e4d5"],
    "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6": ["c2c4", "g1f3", "b1c3"],
  },
  label: 'Extinction Chess',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  title: 'Extinction Chess',
  description: 'You lose when any one piece type is completely eliminated from your army. Protecting your last bishop matters more than protecting your king.',
  rule: 'Board: 8×8 · Win: Eliminate a piece type',
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var myCounts = {}, oppCounts = {};
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      var t = MCE.pieceType(p);
      if (MCE.pieceColor(p) === g.turn) {
        myCounts[t] = (myCounts[t] || 0) + 1;
      } else {
        oppCounts[t] = (oppCounts[t] || 0) + 1;
      }
    }
    var score = material;
    var types = ['p', 'n', 'b', 'r', 'q', 'k'];
    for (var j = 0; j < types.length; j++) {
      var tt = types[j];
      if ((myCounts[tt] || 0) === 1) score -= 400;
      if ((oppCounts[tt] || 0) === 1) score += 300;
      if ((oppCounts[tt] || 0) === 0) score = 100000;
      if ((myCounts[tt] || 0) === 0) score = -100000;
    }
    return score;
  },
  winCondition: function(g) {
    var initial = ['p', 'n', 'b', 'r', 'q', 'k'];
    var currentW = {};
    var currentB = {};
    var i, p, t;
    for (i = 0; i < g.board.length; i++) {
      p = g.board[i];
      if (!p) continue;
      t = MCE.pieceType(p);
      if (MCE.pieceColor(p) === MCE.WHITE) {
        currentW[t] = true;
      } else {
        currentB[t] = true;
      }
    }
    for (i = 0; i < initial.length; i++) {
      t = initial[i];
      if (!currentW[t]) return 'extinction-b';
      if (!currentB[t]) return 'extinction-w';
    }
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('extinction-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'extinction-w' ? 'w' : 'b'))) + ' — piece type extinct!';
    }
    return null;
  },
});
