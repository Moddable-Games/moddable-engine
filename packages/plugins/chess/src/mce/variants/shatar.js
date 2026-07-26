import MCE from '../engine.js';
MCE.registerVariant('shatar', {
  label: 'Shatar',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  title: 'Shatar (Mongolian Chess)',
  description: 'Mongolian chess where check does not exist. You win by leaving the opponent with a bare king — their last remaining piece. Standard moves otherwise.',
  rule: 'Board: 8×8 · Win: Bare king',
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var oppCount = 0;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (p && MCE.pieceColor(p) !== g.turn) oppCount++;
    }
    if (oppCount === 1) return 100000;
    return material + (16 - oppCount) * 60;
  },
  winCondition: function(g) {
    var wCount = 0, bCount = 0, wKing = false, bKing = false;
    for (var i = 0; i < g.board.length; i++) {
      if (!g.board[i]) continue;
      var color = MCE.pieceColor(g.board[i]);
      var type = MCE.pieceType(g.board[i]);
      if (color === MCE.WHITE) { wCount++; if (type === 'k') wKing = true; }
      else { bCount++; if (type === 'k') bKing = true; }
    }
    if (!wKing) return 'shatar-b';
    if (!bKing) return 'shatar-w';
    if (wCount === 1 && wKing) return 'shatar-b';
    if (bCount === 1 && bKing) return 'shatar-w';
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('shatar-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'shatar-w' ? 'w' : 'b'))) + ' — bare king!';
    }
    return null;
  },
});
