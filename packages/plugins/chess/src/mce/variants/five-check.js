import MCE from '../engine.js';
MCE.registerVariant('fiveCheck', {
  group: 'Tactical',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3", "c2c4"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "c7c5", "e7e6", "d7d5"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "b1c3", "f1c4"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "e7e6"],
    "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3": ["e7e5", "g8f6", "c7c5"],
  },
  label: 'Five-Check',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  checkThreshold: 5,
  title: 'Five-Check',
  description: 'Like Three-Check but you need five checks to win. More strategic than Single-Check, more aggressive than standard.',
  rule: 'Board: 8×8 · Win: 5 checks or checkmate',
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var mySide = g.turn === MCE.WHITE ? 'b' : 'w';
    var oppSide = g.turn === MCE.WHITE ? 'w' : 'b';
    var myChecks = g.checkCount[mySide] || 0;
    var oppChecks = g.checkCount[oppSide] || 0;
    return material + myChecks * 250 - oppChecks * 250;
  },
  winCondition: function(g) {
    if (g.checkCount.w >= 5) return 'checkmate';
    if (g.checkCount.b >= 5) return 'checkmate';
    return null;
  },
});
