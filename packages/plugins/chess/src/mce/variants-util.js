import MCE, { rc, sq, onBoard, pieceColor } from './engine.js';
import { legalMoves } from './moves.js';

function getVariantStatus(g) {
  const vc = MCE.getVariantConfig(g.variant);
  if (vc && vc.winCondition) {
    return vc.winCondition(g);
  }
  return null;
}

function variantLegalMoves(g) {
  const vc = MCE.getVariantConfig(g.variant);
  let moves = legalMoves(g);
  if (vc && vc.moveFilter) {
    moves = vc.moveFilter(g, moves);
  }
  return moves;
}

function randomFEN960() {
  const pieces = Array(8).fill(null);
  const empty = () => pieces.map((p,i) => p===null ? i : -1).filter(i => i>=0);
  const darkSqs = [0,2,4,6], lightSqs = [1,3,5,7];
  pieces[darkSqs[Math.floor(Math.random()*4)]] = 'b';
  pieces[lightSqs[Math.floor(Math.random()*4)]] = 'b';
  let e = empty(); pieces[e[Math.floor(Math.random()*e.length)]] = 'q';
  e = empty(); pieces[e[Math.floor(Math.random()*e.length)]] = 'n';
  e = empty(); pieces[e[Math.floor(Math.random()*e.length)]] = 'n';
  e = empty();
  pieces[e[0]] = 'r'; pieces[e[1]] = 'k'; pieces[e[2]] = 'r';

  const blackRank = pieces.join('');
  const whiteRank = blackRank.toUpperCase();
  return blackRank + '/pppppppp/8/8/8/8/PPPPPPPP/' + whiteRank + ' w KQkq - 0 1';
}

const QUEEN_DIRS = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
const KNIGHT_JUMPS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];

MCE.registerPiece('m', {
  genMoves: function(g, from, side) {
    const moves = [];
    const [r, c] = rc(from, g);
    for (const [dr, dc] of QUEEN_DIRS) {
      let nr = r + dr, nc = c + dc;
      while (onBoard(nr, nc, g)) {
        const target = sq(nr, nc, g);
        const tp = g.board[target];
        if (tp) {
          if (pieceColor(tp) !== side) moves.push({ from, to: target, flag: null });
          break;
        }
        moves.push({ from, to: target, flag: null });
        nr += dr; nc += dc;
      }
    }
    for (const [dr, dc] of KNIGHT_JUMPS) {
      const nr = r + dr, nc = c + dc;
      if (!onBoard(nr, nc, g)) continue;
      const target = sq(nr, nc, g);
      const tp = g.board[target];
      if (!tp || pieceColor(tp) !== side) moves.push({ from, to: target, flag: null });
    }
    return moves;
  },
  attacks: function(g, from, target) {
    const [fr, fc] = rc(from, g);
    const [tr, tc] = rc(target, g);
    const dr = tr - fr, dc = tc - fc;
    if ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)) return true;
    if (dr === 0 && dc === 0) return false;
    if (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) {
      const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
      const stepC = dc === 0 ? 0 : dc / Math.abs(dc);
      let cr = fr + stepR, cc = fc + stepC;
      while (cr !== tr || cc !== tc) {
        if (g.board[sq(cr, cc, g)]) return false;
        cr += stepR; cc += stepC;
      }
      return true;
    }
    return false;
  }
});

Object.assign(MCE, { getVariantStatus, variantLegalMoves, randomFEN960 });

export { getVariantStatus, variantLegalMoves, randomFEN960 };
