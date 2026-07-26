import MCE from '../engine.js';
MCE.registerVariant('recruitmentChess', {
  label: 'Recruitment',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Recruitment Chess',
  description: 'Captured pieces defect to the captor — they flip colour and appear on the square the capturing piece vacated. The board fills with turncoats as the game progresses.',
  rule: 'Board: 8×8 · Win: Checkmate',
  afterMove: function(g, move, undo) {
    if (move.flag === 'action') return;

    var moverSide = undo.turn;
    var captured = undo.captured;

    // Handle en passant captures
    if (move.flag === 'ep') {
      captured = undo.epCaptured;
      if (captured) {
        // Flip the captured pawn and place it at the vacated square
        var flipped = (moverSide === MCE.WHITE) ? MCE.pieceType(captured).toUpperCase() : MCE.pieceType(captured);
        MCE.mutateBoard(g, undo, [{ sq: move.from, piece: flipped }]);
      }
      return;
    }

    if (!captured) return;

    // Don't recruit kings (that would break the game)
    if (MCE.pieceType(captured) === 'k') return;

    // Flip the captured piece's colour and place at the vacated square (from)
    var capturedType = MCE.pieceType(captured);
    var recruited;
    if (moverSide === MCE.WHITE) {
      recruited = capturedType.toUpperCase();
    } else {
      recruited = capturedType;
    }

    MCE.mutateBoard(g, undo, [{ sq: move.from, piece: recruited }]);
  },
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var score = material;

    // In recruitment chess, capturing is even more valuable
    // because you gain a piece AND the opponent loses one (net +2 pieces)
    // The default evaluator already accounts for material on board,
    // so we add a small bonus for piece count advantage
    var myCount = 0, oppCount = 0;
    var side = g.turn;
    var total = g.rows * g.cols;
    for (var i = 0; i < total; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceColor(p) === side) myCount++;
      else oppCount++;
    }

    // Bonus for numerical superiority (on top of material value)
    score += (myCount - oppCount) * 30;

    return score;
  },
});
