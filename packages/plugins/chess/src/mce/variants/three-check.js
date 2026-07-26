import MCE from '../engine.js';
MCE.registerVariant('threeCheck', {
  group: 'Tactical',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "c7c5", "e7e6"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["d2d4", "f1c4", "g1f3"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["b8c6", "d7d6", "g8f6"],
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6": ["g1f3", "f1c4", "d2d4"],
  },
  label: 'Three-Check',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  checkThreshold: 3,
  title: 'Three-Check',
  description: 'Standard rules, but delivering three checks to your opponent wins immediately — no need for checkmate.',
  rule: 'Board: 8×8 · Win: Checkmate or 3 checks',
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var mySide = g.turn === MCE.WHITE ? 'b' : 'w';
    var oppSide = g.turn === MCE.WHITE ? 'w' : 'b';
    var myChecks = g.checkCount[mySide] || 0;
    var oppChecks = g.checkCount[oppSide] || 0;
    return material + myChecks * 400 - oppChecks * 400;
  },
  winCondition: function(g) {
    if (g.checkCount.w >= 3) return 'checkmate';
    if (g.checkCount.b >= 3) return 'checkmate';
    return null;
  },
});
