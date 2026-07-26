import MCE from '../engine.js';
MCE.registerVariant('omnicide', {
  label: 'Omnicide Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  title: 'Omnicide Chess',
  description: 'The goal is to lose all your pieces. Unlike Antichess, captures are NOT forced — you choose freely. The king is just another piece (no check).',
  rule: 'Board: 8×8 · Win: Lose all pieces',
  evaluate: function(g) {
    var myCount = 0, oppCount = 0;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceColor(p) === g.turn) myCount++;
      else oppCount++;
    }
    if (myCount === 0) return 100000;
    if (oppCount === 0) return -100000;
    var totalPieces = myCount + oppCount;
    return (oppCount - myCount) * 500 - totalPieces * 30;
  },
  winCondition: function(g) {
    var hasPiece = false;
    for (var i = 0; i < g.board.length; i++) {
      if (g.board[i] && MCE.pieceColor(g.board[i]) === g.turn) {
        hasPiece = true;
        break;
      }
    }
    if (!hasPiece) return 'omnicide-' + g.turn;
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('omnicide-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'omnicide-w' ? 'w' : 'b'))) + ' — all pieces captured!';
    }
    return null;
  },
});
