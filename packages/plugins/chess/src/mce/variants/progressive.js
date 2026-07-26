import MCE from '../engine.js';
MCE.registerVariant('progressive', {
  label: 'Progressive',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  progressiveMove: 1,
  title: 'Progressive Chess',
  description: 'White makes 1 move, then Black makes 2, White makes 3, Black makes 4, and so on — escalating each turn. Giving check ends your turn immediately.',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    g.progressiveMove = 1;
  },
  turnLogic: function(g, undo) {
    g.movesThisTurn++;
    undo.movesThisTurn = g.movesThisTurn - 1;
    undo.progressiveMove = g.progressiveMove;
    undo.fullmove = g.fullmove;
    var opp = g.turn === MCE.WHITE ? MCE.BLACK : MCE.WHITE;
    var givesCheck = MCE.inCheck(g, opp);
    if (g.movesThisTurn >= g.progressiveMove || givesCheck) {
      if (g.turn === MCE.BLACK) g.fullmove++;
      g.progressiveMove++;
      MCE.advanceTurn(g);
      g.movesThisTurn = 0;
    }
  },
  restoreState: function(g, undo) {
    if (undo.progressiveMove !== undefined) g.progressiveMove = undo.progressiveMove;
    if (undo.movesThisTurn !== undefined) g.movesThisTurn = undo.movesThisTurn;
    if (undo.fullmove !== undefined) g.fullmove = undo.fullmove;
  },
  statusText: function(g, helpers) {
    if (g.movesThisTurn > 0) {
      var turn = helpers.nameFor(g.turn);
      return turn + ' — move ' + (g.movesThisTurn + 1) + ' of ' + g.progressiveMove;
    }
    return null;
  },
  aiMoveCount: function(g) {
    return g.progressiveMove;
  },
});
