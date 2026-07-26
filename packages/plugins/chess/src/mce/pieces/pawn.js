import MCE from '../engine.js';

MCE.registerPiece('p', {
  name: 'Pawn',
  category: 'standard',
  movement: 'Forward one square (two from start rank)',
  capture: 'One square diagonally forward',
  variants: ['standard', 'capablanca', 'grand'],

  genMoves(g, from, side) {
    const moves = [];
    const [r, c] = MCE.rc(from, g);
    MCE.genPawnMoves(g, from, r, c, side, moves);
    return moves;
  },

  attacks(g, from, target) {
    const [fr, fc] = MCE.rc(from, g);
    const [tr, tc] = MCE.rc(target, g);
    const owner = MCE.pieceOwner(from, g);
    const dir = g.pawnDirection ? g.pawnDirection(owner) : (owner === MCE.WHITE ? -1 : 1);
    const style = g.pawnMoveStyle || 'standard';
    const dr = tr - fr, dc = tc - fc;
    if (style === 'berolina') return dr === dir && dc === 0;
    return dr === dir && Math.abs(dc) === 1;
  },
});
