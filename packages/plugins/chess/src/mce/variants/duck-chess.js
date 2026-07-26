import MCE from '../engine.js';
MCE.registerVariant('duckChess', {
  group: 'Alternate Rules',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e5", "d7d5", "c7c5", "g8f6"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "e7e6"],
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6": ["g1f3", "f1c4", "b1c3"],
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6": ["e4d5", "e4e5", "b1c3"],
  },
  label: 'Duck Chess',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  noRepetitionDraw: true,
  title: 'Duck Chess',
  description: 'After each move, place the duck (yellow blocker) on any empty square. The duck blocks all movement. Win by capturing the opponent\'s king — no check warnings.',
  rule: 'Board: 8×8 · Win: Capture king',
  init: function(g) {
    g.duckSq = -1;
    g.duckPhase = false;
  },
  moveFilter: function(g, moves) {
    if (g.duckSq >= 0) {
      return moves.filter(function(m) { return m.to !== g.duckSq; });
    }
    return moves;
  },
  winCondition: function(g) {
    var whiteKing = false;
    var blackKing = false;
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
    var moves = MCE.variantLegalMoves(g);
    if (moves.length === 0) return 'stalemate';
    return null;
  },
  turnLogic: function(g, undo) {
    if (!g.duckPhase) {
      g.duckPhase = true;
    } else {
      g.duckPhase = false;
      if (g.turn === MCE.BLACK) g.fullmove++;
      MCE.advanceTurn(g);
    }
    undo.duckPhase = !g.duckPhase;
  },
  restoreState: function(g, undo) {
    if (undo.duckPhase !== undefined) g.duckPhase = undo.duckPhase;
  },
});
