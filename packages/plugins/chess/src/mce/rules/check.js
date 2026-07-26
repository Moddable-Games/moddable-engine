import MCE from '../engine.js';

MCE.registerRule('check', {
  flags: [],

  isLegal(g, move, side) {
    if (g.noCheck) return true;
    const undo = MCE.makeMove(g, move);
    const legal = !MCE.inCheck(g, side);
    MCE.unmakeMove(g, undo);
    return legal;
  },

  getStatus(g) {
    const moves = MCE.legalMoves(g);
    if (moves.length === 0) {
      return MCE.inCheck(g, g.turn) ? 'checkmate' : 'stalemate';
    }
    if (MCE.inCheck(g, g.turn)) return 'check';
    return null;
  },
});
