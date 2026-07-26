import MCE from '../engine.js';
MCE.registerVariant('checklessChess', {
  label: 'Checkless Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Checkless Chess',
  description: 'You may not give check unless the move is checkmate. Any move that gives check without delivering mate is illegal.',
  rule: 'Board: 8×8 · Win: Checkmate',
  moveFilter: function(g, moves) {
    return moves.filter(function(m) {
      var undo = MCE.makeMove(g, m);
      var opp = g.turn;
      var oppInCheck = MCE.inCheck(g, opp);
      if (!oppInCheck) {
        MCE.unmakeMove(g, undo);
        return true;
      }
      var oppMoves = MCE.legalMoves(g);
      var isCheckmate = oppMoves.length === 0;
      MCE.unmakeMove(g, undo);
      return isCheckmate;
    });
  },
});
