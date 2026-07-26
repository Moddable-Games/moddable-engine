import MCE from '../engine.js';
MCE.registerVariant('monsterChess', {
  label: 'Monster Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
  title: 'Monster Chess',
  description: 'White has only a king and rooks but gets two moves per turn. Black has a full army with one move per turn. Giving check ends your turn early.',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    g.maxMovesPerTurn = { w: 2, b: 1 };
    g.lastMovedSq = -1;
  },
  turnLogic: function(g, undo) {
    g.movesThisTurn++;
    undo.movesThisTurn = g.movesThisTurn - 1;
    undo.lastMovedSq = g.lastMovedSq;
    undo.fullmove = g.fullmove;
    var max = g.maxMovesPerTurn[g.turn] || 1;
    var opp = g.turn === MCE.WHITE ? MCE.BLACK : MCE.WHITE;
    var givesCheck = MCE.inCheck(g, opp);
    if (g.movesThisTurn >= max || givesCheck) {
      if (g.turn === MCE.BLACK) g.fullmove++;
      MCE.advanceTurn(g);
      g.movesThisTurn = 0;
      g.lastMovedSq = -1;
    } else {
      g.lastMovedSq = undo.to;
    }
  },
  restoreState: function(g, undo) {
    if (undo.movesThisTurn !== undefined) g.movesThisTurn = undo.movesThisTurn;
    if (undo.lastMovedSq !== undefined) g.lastMovedSq = undo.lastMovedSq;
    if (undo.fullmove !== undefined) g.fullmove = undo.fullmove;
  },
  statusText: function(g, helpers) {
    if (g.movesThisTurn > 0) {
      var max = g.maxMovesPerTurn[g.turn] || 1;
      var turn = helpers.nameFor(g.turn);
      return turn + ' — move ' + (g.movesThisTurn + 1) + ' of ' + max;
    }
    return null;
  },
  aiMoveCount: function(g) {
    return g.maxMovesPerTurn[g.turn] || 1;
  },
  evaluate: function(g, defaultEval) {
    var VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    var whiteScore = 0, blackScore = 0;
    var whiteKingSq = -1, blackKingSq = -1;
    var whitePawns = 0;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      var color = MCE.pieceColor(p);
      var type = MCE.pieceType(p);
      if (type === 'k') {
        if (color === MCE.WHITE) whiteKingSq = i;
        else blackKingSq = i;
        continue;
      }
      var val = VALS[type] || 100;
      if (color === MCE.WHITE) {
        var rank = MCE.rc(i, g)[0];
        var advance = 7 - rank;
        if (type === 'p') {
          whitePawns++;
          whiteScore += val + advance * advance * 15;
        } else {
          whiteScore += val + advance * 20;
        }
      } else {
        blackScore += val;
      }
    }
    if (whiteKingSq >= 0 && blackKingSq >= 0) {
      var wr = MCE.rc(whiteKingSq, g), br = MCE.rc(blackKingSq, g);
      var kDist = Math.abs(wr[0] - br[0]) + Math.abs(wr[1] - br[1]);
      whiteScore += (14 - kDist) * 15;
    }
    whiteScore += whitePawns * 50;
    if (g.turn === MCE.WHITE) return whiteScore - blackScore * 0.25;
    return blackScore - whiteScore * 0.6;
  },
});
