import MCE from '../engine.js';
MCE.registerVariant('displacementChess', {
  label: 'Displacement Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Displacement Chess',
  description: 'In addition to normal moves, any piece can swap positions with an adjacent friendly piece. The king may not swap into check. Opens up powerful coordination tactics.',
  rule: 'Board: 8×8 · Win: Checkmate',
  moveFilter: function(g, moves) {
    var side = g.turn;
    var total = g.rows * g.cols;
    var dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (var i = 0; i < total; i++) {
      var p = g.board[i];
      if (!p || !MCE.isFriendly(i, side, g)) continue;
      var rc = MCE.rc(i, g);
      for (var d = 0; d < dirs.length; d++) {
        var nr = rc[0] + dirs[d][0], nc = rc[1] + dirs[d][1];
        if (!MCE.onBoard(nr, nc, g)) continue;
        var target = MCE.sq(nr, nc, g);
        if (target <= i) continue;
        if (!g.board[target] || !MCE.isFriendly(target, side, g)) continue;
        moves.push({ from: i, to: target, flag: 'swap' });
      }
    }
    return moves;
  },
  beforeMove: function(g, move, undo) {
    if (move.flag === 'swap') {
      var a = g.board[move.from];
      var b = g.board[move.to];
      g.board[move.from] = b;
      g.board[move.to] = a;
      if (g.pieceData) {
        var pdA = g.pieceData[move.from];
        g.pieceData[move.from] = g.pieceData[move.to];
        g.pieceData[move.to] = pdA;
      }
    } else {
      g.board[move.to] = g.board[move.from];
      g.board[move.from] = null;
      if (g.pieceData) {
        g.pieceData[move.to] = g.pieceData[move.from];
        g.pieceData[move.from] = null;
      }
    }
  },
});
