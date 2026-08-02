import MCE from '../engine.js';

function bareKingWin(g) {
  var wCount = 0, bCount = 0;
  for (var i = 0; i < g.board.length; i++) {
    if (!g.board[i]) continue;
    if (MCE.pieceColor(g.board[i]) === MCE.WHITE) wCount++;
    else bCount++;
  }
  if (wCount === 1) return 'bare-b';
  if (bCount === 1) return 'bare-w';
  return null;
}

MCE.registerVariant('shatranj', {
  label: 'Shatranj',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'rnekfenr/pppppppp/8/8/8/8/PPPPPPPP/RNEKFENR w - - 0 1',
  noCastling: true,
  noEnPassant: true,
  noDoubleStep: true,
  promotionPieces: ['f'],
  stalemateMeaning: 'win',
  title: 'Shatranj',
  description: 'Medieval Islamic chess (c. 7th century). Ferz (F) moves one step diagonally; Alfil (E) leaps two squares diagonally. No castling, no en passant, no double pawn advance. Stalemate and bare king both win.',
  rule: 'Board: 8×8 · Win: Checkmate, bare king, or stalemate',
  winCondition: function(g) {
    return bareKingWin(g);
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('bare-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'bare-w' ? 'w' : 'b'))) + ' — bare king!';
    }
    return null;
  },
  evaluate: function(g, defaultEval) {
    var VALS = { p: 100, n: 300, e: 150, f: 150, r: 500, k: 0 };
    var score = 0;
    var oppCount = 0;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      var color = MCE.pieceColor(p);
      var type = MCE.pieceType(p);
      var val = VALS[type] || 100;
      if (color === g.turn) score += val;
      else { score -= val; oppCount++; }
    }
    if (oppCount === 1) return 100000;
    return score + (16 - oppCount) * 40;
  },
});
