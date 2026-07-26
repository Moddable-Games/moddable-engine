import MCE from '../engine.js';
MCE.registerVariant('fogOfWar', {
  group: 'Alternate Rules',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3", "b1c3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "d7d5", "g8f6", "b8c6"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "e7e6", "b8c6"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "b1c3", "d2d4", "f1c4"],
    "rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq -": ["d7d5", "e7e5", "g8f6"],
  },
  label: 'Fog of War',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  noRepetitionDraw: true,
  title: 'Fog of War',
  description: 'You can only see squares your pieces can legally move to. Hidden squares are darkened. No check warnings — you must capture the king to win.',
  rule: 'Board: 8×8 · Win: Capture king',
  visibility: function(g, side) {
    var visible = new Set();
    var total = g.rows * g.cols;
    for (var i = 0; i < total; i++) {
      var p = g.board[i];
      if (!p || MCE.pieceColor(p) !== side) continue;
      visible.add(i);
    }
    var tempG = Object.assign({}, g, { turn: side });
    var moves = MCE.pseudoLegalMoves(tempG);
    for (var j = 0; j < moves.length; j++) {
      visible.add(moves[j].to);
    }
    return visible;
  },
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var myActivity = 0, oppActivity = 0;
    var total = g.rows * g.cols;
    for (var i = 0; i < total; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceColor(p) === g.turn) {
        var rc = MCE.rc(i, g);
        var centerDist = Math.abs(rc[0] - 3.5) + Math.abs(rc[1] - 3.5);
        myActivity += (7 - centerDist) * 10;
      }
    }
    return material + myActivity;
  },
  winCondition: function(g) {
    var whiteKing = false, blackKing = false;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceType(p) === 'k') {
        if (MCE.pieceColor(p) === MCE.WHITE) whiteKing = true;
        else blackKing = true;
      }
    }
    if (!whiteKing) return 'checkmate';
    if (!blackKing) return 'checkmate';
    return null;
  },
});
