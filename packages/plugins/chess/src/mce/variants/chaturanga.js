import MCE from '../engine.js';

MCE.registerPiece('e', {
  genMoves: function(g, from, side) {
    var moves = [];
    var dirs = [[-2,-2],[-2,2],[2,-2],[2,2]];
    var rc = MCE.rc(from, g);
    for (var i = 0; i < dirs.length; i++) {
      var nr = rc[0] + dirs[i][0], nc = rc[1] + dirs[i][1];
      var coords = MCE.wrapCoords(nr, nc, g);
      nr = coords[0]; nc = coords[1];
      if (!MCE.onBoard(nr, nc, g)) continue;
      var target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isFriendly(target, side, g)) continue;
      moves.push({ from: from, to: target, flag: g.board[target] ? 'capture' : null });
    }
    return moves;
  },
  attacks: function(g, from, target) {
    var fr = MCE.rc(from, g), tr = MCE.rc(target, g);
    return Math.abs(tr[0] - fr[0]) === 2 && Math.abs(tr[1] - fr[1]) === 2;
  }
});

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

MCE.registerVariant('chaturanga', {
  label: 'Chaturanga',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'rnefkenr/pppppppp/8/8/8/8/PPPPPPPP/RNEFKENR w - - 0 1',
  noCastling: true,
  noEnPassant: true,
  noDoubleStep: true,
  promotionPieces: ['f'],
  stalemateMeaning: 'win',
  title: 'Chaturanga',
  description: 'Ancient Indian ancestor of all chess (c. 600 CE). Weak counsellor (F) moves one step diagonally; elephant (E) leaps two squares diagonally. No castling, no en passant, no double pawn advance. Stalemate wins. Bare king wins.',
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
