import MCE from '../engine.js';
MCE.registerVariant('stalemateWins', {
  label: 'Stalemate Wins',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Stalemate Wins',
  description: 'Standard chess rules but stalemate is a WIN for the stalemating side (not a draw). Completely changes endgame theory.',
  rule: 'Board: 8×8 · Win: Checkmate or stalemate',
  stalemateMeaning: 'win',
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var oppMoves = MCE.legalMoves({ ...g, turn: g.turn === MCE.WHITE ? MCE.BLACK : MCE.WHITE }).length;
    var mobilityPressure = Math.max(0, 20 - oppMoves) * 30;
    return material + mobilityPressure;
  },
});
