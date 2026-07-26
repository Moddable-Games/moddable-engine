import MCE from '../engine.js';
import { legalMoves, inCheck } from '../moves.js';

function crossesGrid(g, from, to) {
  var fromRC = MCE.rc(from, g);
  var toRC = MCE.rc(to, g);
  var crossesCol = Math.floor(fromRC[1] / 2) !== Math.floor(toRC[1] / 2);
  var crossesRow = Math.floor(fromRC[0] / 2) !== Math.floor(toRC[0] / 2);
  return crossesCol || crossesRow;
}

MCE.registerVariant('gridChess', {
  label: 'Grid Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Grid Chess',
  description: 'The board is divided into 2×2 grid cells. A move is only legal if the piece crosses at least one grid line (between columns b-c, d-e, f-g and between rows 2-3, 4-5, 6-7).',
  rule: 'Board: 8×8 · Win: Checkmate',
  attackFilter: function(g, from, to) {
    return crossesGrid(g, from, to);
  },
  winCondition: function(g) {
    var moves = legalMoves(g);
    var vc = MCE.getVariantConfig('gridChess');
    if (vc && vc.moveFilter) moves = vc.moveFilter(g, moves);
    if (moves.length === 0) {
      return inCheck(g, g.turn) ? 'checkmate' : 'stalemate';
    }
    return null;
  },
  moveFilter: function(g, moves) {
    return moves.filter(function(m) {
      return crossesGrid(g, m.from, m.to);
    });
  },
});
