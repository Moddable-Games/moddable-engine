import MCE from '../engine.js';
MCE.registerVariant('crazyhouse', {
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "d7d5", "g8f6"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "d2d4", "b1c3"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -": ["b8c6", "g8f6", "d7d6"],
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6": ["e4d5", "b1c3", "e4e5"],
    "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["e4e5", "b1c3", "d2d3"],
  },
  label: 'Crazyhouse',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Crazyhouse',
  description: 'Captured pieces switch sides and can be dropped back onto the board. The most popular chess variant online — deep tactical play with an ever-growing arsenal.',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    g.hand = { w: [], b: [] };
  },
  moveFilter: function(g, moves) {
    var side = g.turn;
    var hand = g.hand[side];
    if (!hand || hand.length === 0) return moves;

    var total = g.rows * g.cols;
    var uniquePieces = {};
    for (var h = 0; h < hand.length; h++) {
      uniquePieces[hand[h]] = true;
    }

    var pieceTypes = Object.keys(uniquePieces);
    for (var p = 0; p < pieceTypes.length; p++) {
      var pt = pieceTypes[p];
      for (var sq = 0; sq < total; sq++) {
        if (g.board[sq]) continue;
        // No pawn drops on rank 0 (black back rank) or rank 7 (white back rank)
        if (pt === 'p') {
          var rc = MCE.rc(sq, g);
          if (rc[0] === 0 || rc[0] === g.rows - 1) continue;
        }
        moves.push({
          from: sq,
          to: sq,
          flag: 'action',
          action: 'drop',
          dropPiece: pt
        });
      }
    }
    return moves;
  },
  afterMove: function(g, move, undo) {
    var side = g.turn;
    var oppSide = (side === MCE.WHITE) ? MCE.BLACK : MCE.WHITE;
    // The turn has NOT advanced yet when afterMove runs — g.turn is still the mover's colour
    // Actually, looking at the engine: afterMove runs BEFORE turnLogic, so g.turn is still the mover
    var moverSide = undo.turn;

    if (move.flag === 'action' && move.action === 'drop') {
      // Place the piece from hand onto the board
      var dropChar = move.dropPiece;
      var placed = (moverSide === MCE.WHITE) ? dropChar.toUpperCase() : dropChar;
      MCE.mutateBoard(g, undo, [{ sq: move.to, piece: placed }]);

      // Remove from hand
      undo._handBefore = g.hand[moverSide].slice();
      var idx = g.hand[moverSide].indexOf(dropChar);
      if (idx !== -1) g.hand[moverSide].splice(idx, 1);
    } else if (undo.captured || move.flag === 'ep') {
      // A capture occurred — add the captured piece (converted) to mover's hand
      var capturedPiece = undo.captured;
      if (move.flag === 'ep') capturedPiece = undo.epCaptured;
      if (capturedPiece) {
        var capturedType = MCE.pieceType(capturedPiece);
        // Promoted pieces revert to pawns when captured in crazyhouse
        // (Standard crazyhouse rule — we can't easily detect promoted pieces,
        // so we just add the piece type as-is)
        undo._handBefore = g.hand[moverSide].slice();
        g.hand[moverSide].push(capturedType);
      }
    }
  },
  restoreState: function(g, undo) {
    if (undo._handBefore !== undefined) {
      var side = undo.turn;
      g.hand[side] = undo._handBefore;
    }
  },
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var score = material;

    // Pieces in hand are worth ~70% of board value
    var pieceValues = { p: 70, n: 210, b: 220, r: 350, q: 630 };
    var side = g.turn;
    var oppSide = (side === MCE.WHITE) ? MCE.BLACK : MCE.WHITE;

    var myHand = g.hand[side] || [];
    var oppHand = g.hand[oppSide] || [];

    for (var i = 0; i < myHand.length; i++) {
      score += (pieceValues[myHand[i]] || 0);
    }
    for (var j = 0; j < oppHand.length; j++) {
      score -= (pieceValues[oppHand[j]] || 0);
    }

    return score;
  },
  statusText: function(g, helpers) {
    var side = g.turn;
    var hand = g.hand[side] || [];
    if (hand.length === 0) return null;
    var display = hand.slice().sort().join(', ');
    return helpers.nameFor(side) + ' hand: ' + display;
  },
});
