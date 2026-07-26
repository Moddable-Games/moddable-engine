import MCE, { WHITE, BLACK, pieceColor, pieceType } from './engine.js';
import { inCheck, legalMoves } from './moves.js';

function makeMove(g, move) {
  const { from, to, flag, promo } = move;
  const piece = g.board[from];
  const captured = g.board[to];
  const undo = {
    from, to, piece, captured, flag, promo,
    capturedAt: to,
    castling: { ...g.castling },
    enPassant: g.enPassant,
    halfmove: g.halfmove,
    turn: g.turn,
    turnIndex: g.turnIndex,
  };

  if (g.pieceData) {
    undo.pieceDataFrom = g.pieceData[from];
    undo.pieceDataTo = g.pieceData[to];
  }

  const vc = MCE.getVariantConfig ? MCE.getVariantConfig(g.variant) : null;
  const isCapture = captured || flag === 'ep';
  const isAction = flag === 'action';
  const rules = MCE.getRules();
  const isCastling = flag === 'castle-k' || flag === 'castle-q';

  let interceptResult = null;
  if (vc && vc.beforeMove) {
    interceptResult = vc.beforeMove(g, move, undo);
  } else if (isAction || isCastling) {
    // Action moves and castling handle their own board state
  } else {
    g.board[to] = piece;
    g.board[from] = null;
    if (g.pieceData) { g.pieceData[to] = g.pieceData[from]; g.pieceData[from] = null; }
  }

  if (interceptResult && interceptResult.cancelCapture) {
    undo.captureIntercepted = true;
  }
  if (interceptResult && interceptResult.redirectCapture !== undefined) {
    undo.captureRedirected = true;
    undo.redirectedSq = interceptResult.redirectCapture;
    undo.redirectedPiece = g.board[interceptResult.redirectCapture];
    g.board[interceptResult.redirectCapture] = null;
  }

  if (!isAction) {
    for (const id in rules) {
      const rule = rules[id];
      if (rule.flags && rule.flags.indexOf(flag) !== -1 && rule.onMake) {
        rule.onMake(g, move, undo);
      }
    }
    if (!isCastling && flag !== 'ep' && flag !== 'double') {
      g.enPassant = -1;
    }
    for (const id in rules) {
      const rule = rules[id];
      if (rule.updateState) {
        rule.updateState(g, from, to, piece);
      }
    }
  }

  if (!isAction && (pieceType(piece) === 'p' || captured)) g.halfmove = 0;
  else g.halfmove++;

  undo._pendingActionBefore = g._pendingAction || null;

  if (g._pendingAction) {
    g._pendingAction = null;
    undo._wasPendingAction = true;
  }

  if (vc && vc.afterMove) {
    vc.afterMove(g, move, undo);
  }

  if (g._pendingAction) {
    // afterMove set a pending action — don't advance turn
  } else if (vc && vc.turnLogic) {
    vc.turnLogic(g, undo);
  } else {
    if (g.effects && g.effects.length > 0) MCE.tickEffects(g, undo);
    if (g.turn === BLACK) g.fullmove++;
    MCE.advanceTurn(g);
  }

  g.history.push(move);
  g.positionHistory.push(MCE.positionKey(g));
  return undo;
}

function unmakeMove(g, undo) {
  const { from, to, piece, captured, flag } = undo;

  if (undo._boardMutations) {
    for (let i = undo._boardMutations.length - 1; i >= 0; i--) {
      g.board[undo._boardMutations[i].sq] = undo._boardMutations[i].prev;
    }
  }
  if (undo.captureRedirected) {
    g.board[undo.redirectedSq] = undo.redirectedPiece;
  }

  const rules = MCE.getRules();
  const isCastling = flag === 'castle-k' || flag === 'castle-q';

  if (isCastling && rules.castling) {
    rules.castling.onUnmake(g, undo);
  } else {
    g.board[from] = piece;
    g.board[to] = captured || null;

    if (g.pieceData) {
      g.pieceData[from] = undo.pieceDataFrom;
      g.pieceData[to] = undo.pieceDataTo;
    }
  }

  if (flag === 'ep' && rules['en-passant']) {
    rules['en-passant'].onUnmake(g, undo);
  } else if (flag === 'ep') {
    g.board[undo.epCapSq] = undo.epCaptured;
    if (g.pieceData && undo.pieceDataEp !== undefined) {
      g.pieceData[undo.epCapSq] = undo.pieceDataEp;
    }
  }

  if (undo.exploded) {
    undo.exploded.forEach(e => { g.board[e.sq] = e.piece; });
  }

  g.castling = undo.castling;
  g.enPassant = undo.enPassant;
  g.halfmove = undo.halfmove;
  g.turn = undo.turn;
  g.turnIndex = undo.turnIndex;

  const vc = MCE.getVariantConfig ? MCE.getVariantConfig(g.variant) : null;
  if (vc && vc.restoreState) {
    vc.restoreState(g, undo);
  }

  if (undo._effectsSnapshot) {
    g.effects = undo._effectsSnapshot;
  }

  g._pendingAction = undo._pendingActionBefore || null;

  g.history.pop();
  g.positionHistory.pop();
}

function threefoldRepetition(g) {
  if (g.noRepetitionDraw) return false;
  const current = g.positionHistory[g.positionHistory.length - 1];
  let count = 0;
  for (let i = 0; i < g.positionHistory.length; i++) {
    if (g.positionHistory[i] === current) {
      count++;
      if (count >= 3) return true;
    }
  }
  return false;
}

function insufficientMaterial(g) {
  if (g.noRepetitionDraw) return false;
  if (g.rows !== 8 || g.cols !== 8) return false;

  const pieces = { w: [], b: [] };
  const total = g.rows * g.cols;
  for (let i = 0; i < total; i++) {
    const p = g.board[i];
    if (!p) continue;
    const color = MCE.pieceColor(p);
    const type = MCE.pieceType(p);
    if (type !== 'k') {
      pieces[color].push({ type: type, sq: i });
    }
  }

  const wp = pieces[WHITE];
  const bp = pieces[BLACK];

  if (wp.length === 0 && bp.length === 0) return true;
  if (wp.length === 0 && bp.length === 1 && (bp[0].type === 'b' || bp[0].type === 'n')) return true;
  if (bp.length === 0 && wp.length === 1 && (wp[0].type === 'b' || wp[0].type === 'n')) return true;

  if (wp.length === 1 && bp.length === 1 && wp[0].type === 'b' && bp[0].type === 'b') {
    const [wr, wc] = MCE.rc(wp[0].sq, g);
    const [br, bc] = MCE.rc(bp[0].sq, g);
    if ((wr + wc) % 2 === (br + bc) % 2) return true;
  }

  return false;
}

function getStatus(g) {
  if (g.winCondition) return g.winCondition(g);
  const moves = legalMoves(g);
  if (moves.length === 0) {
    return inCheck(g, g.turn) ? 'checkmate' : 'stalemate';
  }
  if (threefoldRepetition(g)) return 'draw-repetition';
  if (insufficientMaterial(g)) return 'draw-material';
  if (g.halfmove >= 100) return 'draw-50';
  if (inCheck(g, g.turn)) return 'check';
  return 'active';
}

Object.assign(MCE, { makeMove, unmakeMove, getStatus });

export { makeMove, unmakeMove, getStatus };
