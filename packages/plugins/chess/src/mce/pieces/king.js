import MCE from '../engine.js';

MCE.registerPiece('k', {
  name: 'King',
  category: 'standard',
  movement: 'One square in any direction (royal piece)',
  capture: null,
  variants: ['standard', 'capablanca', 'grand'],

  genMoves(g, from, side) {
    const moves = [];
    const [r, c] = MCE.rc(from, g);
    MCE.genJumps(g, from, r, c, side, MCE.KING_DIRS, moves);
    if (!g.noCastling) MCE.genCastling(g, from, r, c, side, moves);
    return moves;
  },

  attacks(g, from, target) {
    const [fr, fc] = MCE.rc(from, g);
    const [tr, tc] = MCE.rc(target, g);
    const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);
    return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
  },
});
