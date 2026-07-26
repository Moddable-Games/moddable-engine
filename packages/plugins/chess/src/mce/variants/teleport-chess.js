import MCE from '../engine.js';
MCE.registerVariant('teleportChess', {
  label: 'Teleport',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Teleportation Chess',
  description: 'Each side has 3 teleports per game. Instead of a normal move, any piece can teleport to any empty square on the board. Use them wisely — they don\'t come back.',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    g.teleportsLeft = { w: 3, b: 3 };
  },
  moveFilter: function(g, moves) {
    var side = g.turn;
    if (!g.teleportsLeft || g.teleportsLeft[side] <= 0) return moves;

    var total = g.rows * g.cols;
    var emptySquares = [];
    for (var sq = 0; sq < total; sq++) {
      if (!g.board[sq]) emptySquares.push(sq);
    }

    var existingTargets = {};
    for (var m = 0; m < moves.length; m++) {
      existingTargets[moves[m].from + ':' + moves[m].to] = true;
    }

    for (var i = 0; i < total; i++) {
      var p = g.board[i];
      if (!p || MCE.pieceColor(p) !== side) continue;

      for (var e = 0; e < emptySquares.length; e++) {
        var key = i + ':' + emptySquares[e];
        if (existingTargets[key]) continue;

        var teleMove = { from: i, to: emptySquares[e], flag: 'action', action: 'teleport' };
        var undo = MCE.makeMove(g, teleMove);
        var legal = !MCE.inCheck(g, side);
        MCE.unmakeMove(g, undo);
        if (legal) moves.push(teleMove);
      }
    }

    return moves;
  },
  afterMove: function(g, move, undo) {
    if (move.flag === 'action' && move.action === 'teleport') {
      var moverSide = undo.turn;
      var piece = g.board[move.from];

      MCE.mutateBoard(g, undo, [
        { sq: move.from, piece: null },
        { sq: move.to, piece: piece }
      ]);

      // Decrement teleport count
      undo._teleportsBefore = g.teleportsLeft[moverSide];
      g.teleportsLeft[moverSide]--;
    }
  },
  restoreState: function(g, undo) {
    if (undo._teleportsBefore !== undefined) {
      var side = undo.turn;
      g.teleportsLeft[side] = undo._teleportsBefore;
    }
  },
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var score = material;

    // Value remaining teleports — they provide tactical flexibility
    var side = g.turn;
    var oppSide = (side === MCE.WHITE) ? MCE.BLACK : MCE.WHITE;
    var myTeleports = g.teleportsLeft ? g.teleportsLeft[side] : 0;
    var oppTeleports = g.teleportsLeft ? g.teleportsLeft[oppSide] : 0;

    score += (myTeleports - oppTeleports) * 80;

    return score;
  },
  statusText: function(g, helpers) {
    var wLeft = g.teleportsLeft ? g.teleportsLeft[MCE.WHITE] : 0;
    var bLeft = g.teleportsLeft ? g.teleportsLeft[MCE.BLACK] : 0;
    return 'Teleports — White: ' + wLeft + ', Black: ' + bLeft;
  },
});
