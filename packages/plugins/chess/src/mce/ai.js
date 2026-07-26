import MCE, { WHITE, BLACK, pieceColor, pieceType } from './engine.js';
import { legalMoves, inCheck } from './moves.js';
import { makeMove, unmakeMove } from './play.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000, a: 650, c: 830, s: 150 };

let openingBook = null;

function loadOpeningBook(basePath) {
  if (typeof fetch !== 'undefined') {
    fetch(basePath + 'data/openings.json')
      .then(function(r) { return r.json(); })
      .then(function(data) { openingBook = data; })
      .catch(function() {});
  }
}


function probeBook(g) {
  var variant = g.variant || 'standard';
  var key = MCE.positionKey(g);
  var vc = MCE.getVariantConfig(variant);
  if (vc && vc.openingBook) {
    var entries = vc.openingBook[key];
    if (entries && entries.length > 0) {
      return parseBookMove(g, entries[Math.floor(Math.random() * entries.length)]);
    }
  }
  if (!openingBook) return null;
  var book = openingBook[variant];
  if (!book) return null;
  var entries2 = book[key];
  if (!entries2 || entries2.length === 0) return null;
  var pick = entries2[Math.floor(Math.random() * entries2.length)];
  return parseBookMove(g, pick);
}

function parseBookMove(g, notation) {
  var fromCol = notation.charCodeAt(0) - 97;
  var fromRow = g.rows - parseInt(notation[1]);
  var toCol = notation.charCodeAt(2) - 97;
  var toRow = g.rows - parseInt(notation[3]);
  var from = MCE.sq(fromRow, fromCol, g);
  var to = MCE.sq(toRow, toCol, g);
  var promo = notation.length > 4 ? notation[4] : null;
  var moves = legalMoves(g);
  for (var i = 0; i < moves.length; i++) {
    if (moves[i].from === from && moves[i].to === to) {
      if (promo && moves[i].promo !== promo) continue;
      return moves[i];
    }
  }
  return null;
}

const DIFFICULTIES = {
  beginner: { timeMs: 200, maxDepth: 2, topN: 5, spread: 0.5 },
  easy: { timeMs: 400, maxDepth: 3, topN: 4, spread: 1.0 },
  medium: { timeMs: 800, maxDepth: 5, topN: 3, spread: 2.0 },
  hard: { timeMs: 1500, maxDepth: 5, topN: 1, spread: 0 },
  expert: { timeMs: 3000, maxDepth: 50, topN: 1, spread: 0 }
};

const TT_SIZE = 1 << 18;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
let tt = new Array(TT_SIZE);
let ttGeneration = 0;

function ttClear() {
  tt = new Array(TT_SIZE);
  ttGeneration++;
}

function ttHash(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return (h >>> 0) & TT_MASK;
}

function ttProbe(key) {
  const entry = tt[ttHash(key)];
  if (entry && entry.key === key && entry.gen === ttGeneration) return entry;
  return null;
}

function ttStore(key, depth, score, flag, bestMove) {
  const idx = ttHash(key);
  const existing = tt[idx];
  if (existing && existing.gen === ttGeneration && existing.depth > depth) return;
  tt[idx] = { key, depth, score, flag, bestMove, gen: ttGeneration };
}

const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];
const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];
const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10, 10,  5, 10, 10,  5, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];
const PST_KING = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20
];

const PST = { p: PST_PAWN, n: PST_KNIGHT, b: PST_BISHOP, k: PST_KING };

function defaultEvaluate(g) {
  let score = 0;
  const total = g.rows * g.cols;
  const is8x8 = g.rows === 8 && g.cols === 8;
  for (let i = 0; i < total; i++) {
    const p = g.board[i];
    if (!p) continue;
    const color = pieceColor(p);
    const type = pieceType(p);
    const val = PIECE_VALUES[type] || 0;
    let posBonus = 0;
    if (is8x8 && PST[type]) {
      const sq = color === WHITE ? i : (56 - (i & ~7)) + (i & 7);
      posBonus = PST[type][sq] || 0;
    }
    score += color === WHITE ? (val + posBonus) : -(val + posBonus);
  }
  return g.turn === WHITE ? score : -score;
}

function evaluate(g) {
  const vc = MCE.getVariantConfig(g.variant);
  if (vc && vc.evaluate) return vc.evaluate(g, defaultEvaluate);
  return defaultEvaluate(g);
}

function getAIMoves(g) {
  const vc = MCE.getVariantConfig(g.variant);
  if (vc && vc.moveFilter) return MCE.variantLegalMoves(g);
  return legalMoves(g);
}

function orderMoves(moves, g, ttBestMove) {
  const scored = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let s = 0;
    if (ttBestMove && m.from === ttBestMove.from && m.to === ttBestMove.to && m.promo === ttBestMove.promo) {
      s = 100000;
    } else if (m.flag === 'capture' || m.flag === 'ep') {
      const victim = g.board[m.to];
      const attacker = g.board[m.from];
      const victimVal = victim ? (PIECE_VALUES[pieceType(victim)] || 100) : 100;
      const attackerVal = attacker ? (PIECE_VALUES[pieceType(attacker)] || 100) : 100;
      s = 10000 + victimVal - (attackerVal >> 3);
    } else if (m.promo) {
      s = 9000 + (PIECE_VALUES[m.promo] || 0);
    } else if (m.flag === 'castle-k' || m.flag === 'castle-q') {
      s = 500;
    } else if (m.flag === 'action') {
      s = 300;
    }
    scored.push({ m, s });
  }
  scored.sort((a, b) => b.s - a.s);
  for (let i = 0; i < scored.length; i++) moves[i] = scored[i].m;
}

function quiesce(g, alpha, beta, deadline) {
  if (deadline && Date.now() > deadline) return evaluate(g);

  const stand = evaluate(g);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const moves = getAIMoves(g);
  const captures = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.flag === 'capture' || m.flag === 'ep' || m.promo) captures.push(m);
  }

  orderMoves(captures, g, null);

  for (let i = 0; i < captures.length; i++) {
    if (!g.board[captures[i].from]) continue;
    const undo = makeMove(g, captures[i]);
    const score = -quiesce(g, -beta, -alpha, deadline);
    unmakeMove(g, undo);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(g, depth, alpha, beta, deadline) {
  if (deadline && Date.now() > deadline) return evaluate(g);

  const key = MCE.positionKey(g);
  const ttEntry = ttProbe(key);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT) return ttEntry.score;
    if (ttEntry.flag === TT_LOWER && ttEntry.score > alpha) alpha = ttEntry.score;
    if (ttEntry.flag === TT_UPPER && ttEntry.score < beta) beta = ttEntry.score;
    if (alpha >= beta) return ttEntry.score;
  }

  if (depth <= 0) return quiesce(g, alpha, beta, deadline);

  const moves = getAIMoves(g);
  if (moves.length === 0) {
    if (g.stalemateMeaning === 'win') return 100000;
    if (inCheck(g, g.turn)) return -100000;
    return 0;
  }

  const ttBest = ttEntry ? ttEntry.bestMove : null;
  orderMoves(moves, g, ttBest);

  let bestMove = moves[0];
  let bestScore = -Infinity;
  let ttFlag = TT_UPPER;

  for (let i = 0; i < moves.length; i++) {
    if (!g.board[moves[i].from] && moves[i].flag !== 'action') continue;
    const undo = makeMove(g, moves[i]);
    const score = -negamax(g, depth - 1, -beta, -alpha, deadline);
    unmakeMove(g, undo);

    if (score > bestScore) {
      bestScore = score;
      bestMove = moves[i];
    }
    if (score > alpha) {
      alpha = score;
      ttFlag = TT_EXACT;
    }
    if (alpha >= beta) {
      ttFlag = TT_LOWER;
      break;
    }
  }

  ttStore(key, depth, bestScore, ttFlag, bestMove);
  return bestScore;
}

function weightedSelect(scored, topN, spread) {
  const pool = scored.slice(0, Math.min(topN, scored.length));
  if (pool.length <= 1 || spread <= 0) return pool[0].move;
  const best = pool[0].score;
  let totalWeight = 0;
  const weights = [];
  for (let i = 0; i < pool.length; i++) {
    const diff = best - pool[i].score;
    const w = Math.exp(-diff / (spread * 100));
    weights.push(w);
    totalWeight += w;
  }
  let r = Math.random() * totalWeight;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].move;
  }
  return pool[pool.length - 1].move;
}

function pickMove(g, depth, opts) {
  opts = opts || {};
  const diff = opts.difficulty ? DIFFICULTIES[opts.difficulty] : null;
  const topN = diff ? diff.topN : 1;
  const spread = diff ? diff.spread : 0;
  const vc = MCE.getVariantConfig ? MCE.getVariantConfig(g.variant) : null;
  const timeMult = (vc && vc.aiTimeMult) || 1;
  const timeMs = (diff ? diff.timeMs : (opts.timeMs || 1500)) * timeMult;

  const moves = getAIMoves(g);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  var bookMove = probeBook(g);
  if (bookMove) return bookMove;

  ttGeneration++;
  const deadline = Date.now() + timeMs;

  const total = g.rows * g.cols;
  const boardMaxDepth = total > 80 ? 4 : total > 64 ? 6 : 50;
  const maxDepth = diff ? Math.min(diff.maxDepth, boardMaxDepth) : boardMaxDepth;

  let bestMove = moves[0];
  let bestScore = -Infinity;
  let completedDepth = 0;
  let lastScored = [];

  for (let d = 1; d <= maxDepth; d++) {
    if (Date.now() > deadline) break;

    let depthBest = moves[0];
    let depthScore = -Infinity;
    const scored = [];

    for (let i = 0; i < moves.length; i++) {
      if (Date.now() > deadline) break;
      const undo = makeMove(g, moves[i]);
      const score = -negamax(g, d - 1, -Infinity, Infinity, deadline);
      unmakeMove(g, undo);
      scored.push({ move: moves[i], score });
      if (score > depthScore) {
        depthScore = score;
        depthBest = moves[i];
      }
    }

    if (Date.now() <= deadline || d === 1) {
      bestMove = depthBest;
      bestScore = depthScore;
      completedDepth = d;
      lastScored = scored;

      scored.sort((a, b) => b.score - a.score);
      for (let i = 0; i < scored.length; i++) moves[i] = scored[i].move;
    }

    if (bestScore >= 90000) break;
  }

  if (topN <= 1 || spread <= 0) return bestMove;

  lastScored.sort((a, b) => b.score - a.score);
  return weightedSelect(lastScored, topN, spread);
}

function pickDuckSquare(g) {
  const total = g.rows * g.cols;
  const empties = [];
  for (let i = 0; i < total; i++) {
    if (!g.board[i] && i !== g.duckSq) empties.push(i);
  }
  if (empties.length === 0) return -1;
  return empties[Math.floor(Math.random() * empties.length)];
}

Object.assign(MCE, {
  aiPickMove: pickMove,
  aiPickDuckSquare: pickDuckSquare,
  AI_DIFFICULTIES: DIFFICULTIES,
  loadOpeningBook: loadOpeningBook
});

export { pickMove as aiPickMove, pickDuckSquare as aiPickDuckSquare, DIFFICULTIES as AI_DIFFICULTIES, loadOpeningBook };
