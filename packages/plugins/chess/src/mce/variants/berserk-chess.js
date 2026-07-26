import MCE from '../engine.js';
MCE.registerVariant('berserkChess', {
  label: 'Berserk',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Berserk Chess',
  description: 'If your move delivers check, you get an immediate bonus move. Only one bonus move per turn — the second move ends your turn regardless.',
  rule: 'Board: 8×8 · Win: Checkmate',
  winCondition: function(g) {
    if (g.movesThisTurn > 0) {
      var opp = g.turn === MCE.WHITE ? MCE.BLACK : MCE.WHITE;
      if (MCE.inCheck(g, opp)) {
        var saved = g.turn;
        g.turn = opp;
        var moves = MCE.legalMoves(g);
        g.turn = saved;
        if (moves.length === 0) return 'checkmate';
      }
    }
    return null;
  },
  turnLogic: function(g, undo) {
    undo.movesThisTurn = g.movesThisTurn || 0;
    undo.fullmove = g.fullmove;
    g.movesThisTurn = (g.movesThisTurn || 0) + 1;
    var opp = g.turn === MCE.WHITE ? MCE.BLACK : MCE.WHITE;
    var givesCheck = MCE.inCheck(g, opp);
    if (g.movesThisTurn >= 2 || !givesCheck) {
      if (g.turn === MCE.BLACK) g.fullmove++;
      MCE.advanceTurn(g);
      g.movesThisTurn = 0;
    }
  },
  restoreState: function(g, undo) {
    if (undo.movesThisTurn !== undefined) g.movesThisTurn = undo.movesThisTurn;
    if (undo.fullmove !== undefined) g.fullmove = undo.fullmove;
  },
  statusText: function(g, helpers) {
    if (g.movesThisTurn === 1) {
      var turn = helpers.nameFor(g.turn);
      return turn + ' — Bonus move!';
    }
    return null;
  },
});
