import MCE from '../engine.js';

function abilitiesOf(type) {
  if (type === 'q') return 6;
  if (type === 'r') return 4;
  if (type === 'b') return 2;
  if (type === 'n') return 1;
  if (type === 'a') return 3;
  if (type === 'c') return 5;
  if (type === 'm') return 7;
  return 0;
}

function typeForAbilities(ab) {
  if (ab === 0) return null;
  if (ab === 1) return 'n';
  if (ab === 2) return 'b';
  if (ab === 3) return 'a';
  if (ab === 4) return 'r';
  if (ab === 5) return 'c';
  if (ab === 6) return 'q';
  if (ab >= 7) return 'm';
  return null;
}

MCE.registerVariant('absorptionChess', {
  label: 'Absorption',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Absorption Chess',
  description: 'Capturing piece permanently gains the victim\'s movement abilities. Absorptions stack — a rook that takes a bishop becomes a queen, then taking a knight becomes an amazon.',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    for (var i = 0; i < g.board.length; i++) {
      if (g.board[i]) {
        var type = MCE.pieceType(g.board[i]);
        g.pieceData[i] = { ab: abilitiesOf(type), wasPawn: type === 'p' };
      }
    }
  },
  afterMove: function(g, move, undo) {
    var to = move.to;
    var captured = undo.captured;
    if (!captured) return;

    var p = g.board[to];
    if (!p) return;
    var capturerType = MCE.pieceType(p);
    var isWhite = MCE.pieceColor(p) === MCE.WHITE;
    var isKing = capturerType === 'k';

    var pd = g.pieceData[to];
    var currentAb = pd ? pd.ab : abilitiesOf(capturerType);

    var victimPd = move.flag === 'ep' ? undo.pieceDataEp : undo.pieceDataTo;
    var victimAb = victimPd ? victimPd.ab : abilitiesOf(MCE.pieceType(captured));

    var newAb = currentAb | victimAb;
    if (newAb === currentAb) return;

    undo._abPrev = currentAb;
    undo._abSq = to;
    g.pieceData[to] = { ab: newAb, wasPawn: pd ? pd.wasPawn : capturerType === 'p' };

    if (!isKing) {
      var newType = typeForAbilities(newAb);
      if (newType && newType !== capturerType) {
        MCE.mutateBoard(g, undo, [{ sq: to, piece: isWhite ? newType.toUpperCase() : newType }]);
      }
    }
  },
  evaluate: function(g, defaultEval) {
    var VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, a: 700, c: 750, m: 1000, k: 0 };
    var score = 0;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      var type = MCE.pieceType(p);
      var val = VALS[type] || 100;
      var pd = g.pieceData[i];
      if (type === 'k' && pd && pd.ab > 0) val = pd.ab * 80;
      if (MCE.pieceColor(p) === g.turn) score += val;
      else score -= val;
    }
    return score;
  },
});
