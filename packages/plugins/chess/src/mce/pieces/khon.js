import MCE from '../engine.js';

MCE.registerPiece('g', {
  name: 'Khon',
  category: 'fairy',
  movement: 'One square diagonally in any direction, or one square straight forward',
  capture: null,
  variants: ['makruk', 'makpong'],

  genMoves(g, from, side) {
    const moves = [];
    const [r, c] = MCE.rc(from, g);
    const fwd = side === MCE.WHITE ? -1 : 1;
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1], [fwd, 0]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      [nr, nc] = MCE.wrapCoords(nr, nc, g);
      if (!MCE.onBoard(nr, nc, g)) continue;
      const target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isFriendly(target, side, g)) continue;
      moves.push({ from, to: target, flag: g.board[target] ? 'capture' : null });
    }
    return moves;
  },

  attacks(g, from, target) {
    const [fr, fc] = MCE.rc(from, g);
    const [tr, tc] = MCE.rc(target, g);
    const dr = tr - fr, dc = tc - fc;
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0)) {
      if (Math.abs(dc) === 1) return true;
      const side = MCE.pieceColor(g.board[from]);
      const fwd = side === MCE.WHITE ? -1 : 1;
      return dr === fwd && dc === 0;
    }
    return false;
  },
});
