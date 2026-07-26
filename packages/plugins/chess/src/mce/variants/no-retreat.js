import MCE from '../engine.js';
import { legalMoves, inCheck } from '../moves.js';
MCE.registerVariant('noRetreat', {
  label: 'No Retreat',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'No Retreat Chess',
  description: 'Pieces cannot move backward toward their own starting rank. White pieces must move to equal or lower row indices (toward rank 8). Black pieces must move to equal or higher row indices (toward rank 1).',
  rule: 'Board: 8×8 · Win: Checkmate',
  winCondition: function(g) {
    var moves = legalMoves(g);
    var vc = MCE.getVariantConfig('noRetreat');
    if (vc && vc.moveFilter) moves = vc.moveFilter(g, moves);
    if (moves.length === 0) {
      return inCheck(g, g.turn) ? 'checkmate' : 'stalemate';
    }
    return null;
  },
  moveFilter: function(g, moves) {
    return moves.filter(function(m) {
      var fromRC = MCE.rc(m.from, g);
      var toRC = MCE.rc(m.to, g);
      var fromRow = fromRC[0];
      var toRow = toRC[0];
      var piece = g.board[m.from];
      if (!piece) return true;
      var color = MCE.pieceColor(piece);
      if (color === MCE.WHITE) {
        return toRow <= fromRow;
      } else {
        return toRow >= fromRow;
      }
    });
  },
});
