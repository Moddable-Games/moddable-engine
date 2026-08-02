const PIECE = { P: 'p', N: 'n', B: 'b', R: 'r', Q: 'q', K: 'k', A: 'a', C: 'c', S: 's', M: 'm' };
const WHITE = 'w', BLACK = 'b';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const pieceRegistry = {};
const variantRegistry = {};
const ruleRegistry = {};

function registerVariant(key, config) {
  variantRegistry[key] = config;
}

function getVariantConfig(key) {
  return resolveVariantConfig(key);
}

function resolveVariantConfig(key) {
  const raw = variantRegistry[key];
  if (!raw) return null;
  if (!raw.extends) return raw;
  const parents = Array.isArray(raw.extends) ? raw.extends : [raw.extends];
  let merged = {};
  for (const parentKey of parents) {
    const parent = resolveVariantConfig(parentKey);
    if (parent) merged = Object.assign(merged, parent);
  }
  return Object.assign(merged, raw);
}

function createGame(config) {
  if (typeof config === 'string' || config === undefined) {
    return createVariantGame(config);
  }
  const rows = config.rows || 8;
  const cols = config.cols || 8;
  const total = rows * cols;
  const players = config.players || [WHITE, BLACK];
  const g = {
    rows: rows,
    cols: cols,
    board: Array(total).fill(null),
    terrain: config.terrain || Array(total).fill(0),
    pieceData: config.pieceData || Array(total).fill(null),
    turn: players[0],
    players: players,
    turnIndex: 0,
    eliminated: new Set(),
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: -1,
    halfmove: 0,
    fullmove: 1,
    history: [],
    positionHistory: [],
    variant: config.variant || null,
    checkCount: { w: 0, b: 0 },
    movesThisTurn: 0,
    duckSq: -1,
    duckPhase: false,
    status: 'active',
    noCastling: config.noCastling || false,
    noEnPassant: config.noEnPassant || false,
    noPromotion: config.noPromotion || false,
    ownershipMode: config.ownershipMode || 'case',
    effects: [],
    legalityFilter: null,
    winCondition: null,
  };
  if (config.fen) loadFEN(g, config.fen);
  g.positionHistory.push(positionKey(g));
  return g;
}

function createVariantGame(variant) {
  const vc = getVariantConfig(variant);
  const rows = (vc && vc.rows) || 8;
  const cols = (vc && vc.cols) || 8;
  const total = rows * cols;
  const g = {
    rows: rows,
    cols: cols,
    board: Array(total).fill(null),
    terrain: Array(total).fill(0),
    pieceData: Array(total).fill(null),
    turn: WHITE,
    players: [WHITE, BLACK],
    turnIndex: 0,
    eliminated: new Set(),
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: -1,
    halfmove: 0,
    fullmove: 1,
    history: [],
    positionHistory: [],
    variant: variant || 'standard',
    checkCount: { w: 0, b: 0 },
    movesThisTurn: 0,
    duckSq: -1,
    duckPhase: false,
    status: 'active',
    noCastling: false,
    noEnPassant: false,
    noPromotion: false,
    effects: [],
    legalityFilter: null,
    winCondition: null,
  };

  if (vc) {
    if (vc.noCastling) g.noCastling = true;
    if (vc.noEnPassant) g.noEnPassant = true;
    if (vc.noDoubleStep) g.noDoubleStep = true;
    if (vc.noPromotion) g.noPromotion = true;
    if (vc.noCheck) g.noCheck = true;
    if (vc.noRepetitionDraw) g.noRepetitionDraw = true;
    if (vc.torpedo) g.torpedo = true;
    if (vc.pawnDirection) g.pawnDirection = vc.pawnDirection;
    if (vc.pawnStartRow) g.pawnStartRow = vc.pawnStartRow;
    if (vc.royalPiece) g.royalPiece = vc.royalPiece;
    if (vc.pieceRoles) g.pieceRoles = vc.pieceRoles;
    if (vc.maxMovesPerTurn) { g.maxMovesPerTurn = vc.maxMovesPerTurn; g.lastMovedSq = -1; }
    if (vc.progressiveMove) g.progressiveMove = vc.progressiveMove;
    if (vc.checkThreshold) g.checkThreshold = vc.checkThreshold;
    if (vc.stalemateMeaning) g.stalemateMeaning = vc.stalemateMeaning;
    if (vc.promotionPieces) g.promotionPieces = vc.promotionPieces;
    if (vc.promotionRank) g.promotionRank = vc.promotionRank;
    if (vc.pawnMoveStyle) g.pawnMoveStyle = vc.pawnMoveStyle;
    if (vc.divergentPieces) g.divergentPieces = vc.divergentPieces;
    if (vc.wrapFiles) g.wrapFiles = true;
    if (vc.wrapRanks) g.wrapRanks = true;
    const fen = vc.fen || INITIAL_FEN;
    loadFEN(g, fen);
    g.positionHistory.push(positionKey(g));
    if (vc.init) { vc.init(g); g._initDone = true; }
    return g;
  }

  const fen = INITIAL_FEN;
  loadFEN(g, fen);
  g.positionHistory.push(positionKey(g));
  return g;
}

function wrapCoords(r, c, g) {
  const rows = (g && g.rows) || 8;
  const cols = (g && g.cols) || 8;
  if (g && g.wrapFiles) c = ((c % cols) + cols) % cols;
  if (g && g.wrapRanks) r = ((r % rows) + rows) % rows;
  return [r, c];
}

function rc(i, g) {
  const cols = (g && g.cols) || 8;
  return [Math.floor(i / cols), i % cols];
}
function sq(r, c, g) {
  const cols = (g && g.cols) || 8;
  return r * cols + c;
}
function onBoard(r, c, g) {
  const rows = (g && g.rows) || 8;
  const cols = (g && g.cols) || 8;
  [r, c] = wrapCoords(r, c, g);
  if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
  if (g && g.terrain) {
    return g.terrain[r * cols + c] !== null;
  }
  return true;
}

function getTerrain(sqIdx, g) {
  if (!g || !g.terrain) return 0;
  return g.terrain[sqIdx];
}

function registerPiece(typeChar, handlers) {
  pieceRegistry[typeChar] = handlers;
}

function getPieceRegistry() {
  return pieceRegistry;
}

function registerRule(id, handlers) {
  ruleRegistry[id] = handlers;
}

function getRules() {
  return ruleRegistry;
}

function setLegalityFilter(g, fn) {
  g.legalityFilter = fn;
}

function setWinCondition(g, fn) {
  g.winCondition = fn;
}

function advanceTurn(g) {
  const count = g.players.length;
  let next = (g.turnIndex + 1) % count;
  let attempts = 0;
  while (g.eliminated.has(g.players[next]) && attempts < count) {
    next = (next + 1) % count;
    attempts++;
  }
  g.turnIndex = next;
  g.turn = g.players[next];
}

function pieceColor(p) { return p === p.toUpperCase() ? WHITE : BLACK; }
function pieceType(p) { return p.toLowerCase(); }

function pieceOwner(sqIdx, g) {
  if (g.ownershipMode === 'pieceData' && g.pieceData && g.pieceData[sqIdx]) {
    return g.pieceData[sqIdx].owner;
  }
  const p = g.board[sqIdx];
  return p ? pieceColor(p) : null;
}

function isFriendly(sqIdx, side, g) {
  if (!g.board[sqIdx]) return false;
  return pieceOwner(sqIdx, g) === side;
}

function isEnemy(sqIdx, side, g) {
  if (!g.board[sqIdx]) return false;
  return pieceOwner(sqIdx, g) !== side;
}

function loadFEN(g, fen) {
  const parts = fen.split(' ');
  const fenRows = parts[0].split('/');
  g.board.fill(null);
  for (let r = 0; r < g.rows; r++) {
    let c = 0;
    if (!fenRows[r]) continue;
    let i = 0;
    while (i < fenRows[r].length) {
      const ch = fenRows[r][i];
      if (ch >= '0' && ch <= '9') {
        let num = ch;
        if (i + 1 < fenRows[r].length && fenRows[r][i+1] >= '0' && fenRows[r][i+1] <= '9') {
          num += fenRows[r][i+1]; i++;
        }
        c += parseInt(num);
      } else {
        g.board[sq(r, c, g)] = ch; c++;
      }
      i++;
    }
  }
  g.turn = parts[1] === 'b' ? BLACK : WHITE;
  if (g.players) {
    g.turnIndex = g.players.indexOf(g.turn);
    if (g.turnIndex < 0) g.turnIndex = 0;
  }
  const cas = parts[2] || '-';
  g.castling = { K: cas.includes('K'), Q: cas.includes('Q'), k: cas.includes('k'), q: cas.includes('q') };
  g.enPassant = parts[3] && parts[3] !== '-' ? algebraicToSq(parts[3], g) : -1;
  g.halfmove = parseInt(parts[4]) || 0;
  g.fullmove = parseInt(parts[5]) || 1;
}

function toFEN(g) {
  let fen = '';
  for (let r = 0; r < g.rows; r++) {
    let empty = 0;
    for (let c = 0; c < g.cols; c++) {
      const p = g.board[sq(r, c, g)];
      if (!p) { empty++; }
      else { if (empty) { fen += empty; empty = 0; } fen += p; }
    }
    if (empty) fen += empty;
    if (r < g.rows - 1) fen += '/';
  }
  fen += ' ' + g.turn;
  let cas = '';
  if (g.castling.K) cas += 'K'; if (g.castling.Q) cas += 'Q';
  if (g.castling.k) cas += 'k'; if (g.castling.q) cas += 'q';
  fen += ' ' + (cas || '-');
  fen += ' ' + (g.enPassant >= 0 ? sqToAlgebraic(g.enPassant, g) : '-');
  fen += ' ' + g.halfmove + ' ' + g.fullmove;
  return fen;
}

function algebraicToSq(s, g) {
  const rows = (g && g.rows) || 8;
  const col = s.charCodeAt(0) - 97;
  const row = rows - parseInt(s.substring(1));
  return sq(row, col, g);
}
function sqToAlgebraic(i, g) {
  const [r, c] = rc(i, g);
  const rows = (g && g.rows) || 8;
  return String.fromCharCode(97 + c) + (rows - r);
}

function positionKey(g) {
  if (g && g.variant) {
    const vc = getVariantConfig(g.variant);
    if (vc && vc.positionKey) return vc.positionKey(g);
  }
  if (g && g.ownershipMode === 'pieceData' && g.pieceData) {
    let key = '';
    const len = g.rows * g.cols;
    for (let i = 0; i < len; i++) {
      const pd = g.pieceData[i];
      key += pd ? pd.key[0] + pd.owner[0] : '.';
    }
    return key + ' ' + g.turn + ' ' + (g.enPassant >= 0 ? g.enPassant : '-');
  }
  const fen = toFEN(g);
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}

function getEffects(g, sq) {
  if (!g.effects) return [];
  return g.effects.filter(function(e) { return e.sq === sq; });
}

function hasEffect(g, sq, type) {
  if (!g.effects) return false;
  return g.effects.some(function(e) { return e.sq === sq && e.type === type; });
}

function addEffect(g, undo, effect) {
  if (!undo._effectsSnapshot) undo._effectsSnapshot = g.effects.map(function(e) { return Object.assign({}, e); });
  g.effects.push(effect);
}

function removeEffect(g, undo, sq, type) {
  if (!undo._effectsSnapshot) undo._effectsSnapshot = g.effects.map(function(e) { return Object.assign({}, e); });
  g.effects = g.effects.filter(function(e) { return !(e.sq === sq && e.type === type); });
}

function tickEffects(g, undo) {
  if (!g.effects || g.effects.length === 0) return;
  if (!undo._effectsSnapshot) undo._effectsSnapshot = g.effects.map(function(e) { return Object.assign({}, e); });
  const vc = g.variant ? getVariantConfig(g.variant) : null;
  for (var i = g.effects.length - 1; i >= 0; i--) {
    if (g.effects[i].duration !== undefined && g.effects[i].duration !== null) {
      g.effects[i].duration--;
      if (g.effects[i].duration <= 0) {
        var expired = g.effects.splice(i, 1)[0];
        if (vc && vc.onEffectExpiry) vc.onEffectExpiry(g, expired, undo);
      }
    }
  }
}

function isSquareBlocked(g, sq) {
  if (!g.effects || g.effects.length === 0) return false;
  return g.effects.some(function(e) { return e.sq === sq && e.blocks; });
}

function mutateBoard(g, undo, mutations) {
  if (!undo._boardMutations) undo._boardMutations = [];
  for (var i = 0; i < mutations.length; i++) {
    undo._boardMutations.push({ sq: mutations[i].sq, prev: g.board[mutations[i].sq] });
    g.board[mutations[i].sq] = mutations[i].piece;
  }
}

const MCE = { PIECE, WHITE, BLACK, INITIAL_FEN, createGame, loadFEN, toFEN, positionKey, rc, sq, wrapCoords, onBoard, getTerrain, pieceColor, pieceType, pieceOwner, isFriendly, isEnemy, algebraicToSq, sqToAlgebraic, registerPiece, getPieceRegistry, registerRule, getRules, setLegalityFilter, setWinCondition, advanceTurn, registerVariant, getVariantConfig, variantRegistry, getEffects, hasEffect, addEffect, removeEffect, tickEffects, isSquareBlocked, mutateBoard };

export { PIECE, WHITE, BLACK, INITIAL_FEN, createGame, loadFEN, toFEN, positionKey, rc, sq, wrapCoords, onBoard, getTerrain, pieceColor, pieceType, pieceOwner, isFriendly, isEnemy, algebraicToSq, sqToAlgebraic, registerPiece, getPieceRegistry, registerRule, getRules, setLegalityFilter, setWinCondition, advanceTurn, registerVariant, getVariantConfig, variantRegistry, getEffects, hasEffect, addEffect, removeEffect, tickEffects, isSquareBlocked, mutateBoard };
export default MCE;
