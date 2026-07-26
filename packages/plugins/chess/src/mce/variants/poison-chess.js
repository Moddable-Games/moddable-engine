import MCE from '../engine.js';
MCE.registerVariant('poisonChess', {
  label: 'Poison',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Poison Chess',
  description: 'Capture squares become poisoned for 3 turns. Any non-king piece that lands on a poisoned square is destroyed at the end of that turn. Kings are immune.',
  rule: 'Board: 8×8 · Win: Checkmate',
  afterMove: function(g, move, undo) {
    if (move.flag === 'action') return;

    var isCapture = undo.captured || move.flag === 'ep';

    // If this move is a capture, poison the capture square
    if (isCapture) {
      var poisonSq = move.to;
      if (move.flag === 'ep') {
        // For en passant, poison the square where the pawn was captured
        poisonSq = undo.epCapSq;
      }
      MCE.addEffect(g, undo, {
        sq: poisonSq,
        type: 'poison',
        duration: 3,
        owner: null
      });
    }

    // Check if the piece that just moved landed on a PREVIOUSLY poisoned square
    // (not the poison we just created from this capture)
    // A piece landing on poison is destroyed — unless it's a king
    if (!isCapture || move.flag === 'ep') {
      // For non-capture moves (or ep where the piece lands on a different square than the captured pawn)
      // check if the landing square has poison
      if (MCE.hasEffect(g, move.to, 'poison') && !isCapture) {
        var landedPiece = g.board[move.to];
        if (landedPiece && MCE.pieceType(landedPiece) !== 'k') {
          MCE.mutateBoard(g, undo, [{ sq: move.to, piece: null }]);
        }
      }
    }
    // For a capture move: the capturing piece lands on the newly poisoned square.
    // It should NOT be destroyed by its own capture's poison.
    // But if there was ALREADY a poison on that square from a previous capture, it IS destroyed.
    if (isCapture && move.flag !== 'ep') {
      // Check if there was poison BEFORE this capture added its own
      // We can check: if there are multiple poison effects on the same square,
      // the earlier one was pre-existing
      var effects = MCE.getEffects(g, move.to);
      var poisonCount = 0;
      for (var i = 0; i < effects.length; i++) {
        if (effects[i].type === 'poison') poisonCount++;
      }
      // If there are 2+ poison effects, there was a pre-existing one
      if (poisonCount >= 2) {
        var landedPiece2 = g.board[move.to];
        if (landedPiece2 && MCE.pieceType(landedPiece2) !== 'k') {
          MCE.mutateBoard(g, undo, [{ sq: move.to, piece: null }]);
        }
      }
    }
  },
  moveFilter: function(g, moves) {
    return moves;
  },
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var score = material;

    // Penalize own pieces that are adjacent to poisoned squares (tactical danger)
    var side = g.turn;
    var total = g.rows * g.cols;
    var dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

    for (var sq = 0; sq < total; sq++) {
      if (!MCE.hasEffect(g, sq, 'poison')) continue;
      var rc = MCE.rc(sq, g);
      for (var d = 0; d < dirs.length; d++) {
        var nr = rc[0] + dirs[d][0];
        var nc = rc[1] + dirs[d][1];
        if (!MCE.onBoard(nr, nc, g)) continue;
        var adjSq = MCE.sq(nr, nc, g);
        var p = g.board[adjSq];
        if (!p) continue;
        if (MCE.pieceColor(p) === side) {
          score -= 25; // Our piece near poison — slightly dangerous
        } else {
          score += 25; // Opponent's piece near poison — good for us
        }
      }
    }

    return score;
  },
  statusText: function(g, helpers) {
    if (!g.effects) return null;
    var poisonCount = 0;
    for (var i = 0; i < g.effects.length; i++) {
      if (g.effects[i].type === 'poison') poisonCount++;
    }
    if (poisonCount === 0) return null;
    return poisonCount + ' poisoned square' + (poisonCount > 1 ? 's' : '') + ' on board';
  },
});
