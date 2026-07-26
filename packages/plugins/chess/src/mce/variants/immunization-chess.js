import MCE from '../engine.js';
MCE.registerVariant('immunizationChess', {
  label: 'Immunization Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Immunization Chess',
  description: 'When a capture occurs, adjacent enemy pieces become immune to capture for 2 full rounds. Build up an invincible army.',
  rule: 'Board: 8x8 - Win: Checkmate',
  afterMove: function(g, move, undo) {
    // Move immunity with the piece
    if (g.effects && move.from !== move.to && move.flag !== 'action') {
      for (var i = 0; i < g.effects.length; i++) {
        if (g.effects[i].type === 'immune' && g.effects[i].sq === move.from && g.effects[i].owner === undo.turn) {
          if (!undo._effectsSnapshot) undo._effectsSnapshot = g.effects.map(function(e) { return Object.assign({}, e); });
          g.effects[i].sq = move.to;
          break;
        }
      }
    }
    if (!undo.captured && move.flag !== 'ep') return;
    var capSq = move.to;
    var rc = MCE.rc(capSq, g);
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (!MCE.onBoard(rc[0] + dr, rc[1] + dc, g)) continue;
        var sq = MCE.sq(rc[0] + dr, rc[1] + dc, g);
        var p = g.board[sq];
        if (!p) continue;
        if (MCE.pieceColor(p) !== undo.turn && MCE.pieceType(p) !== 'k') {
          if (!MCE.hasEffect(g, sq, 'immune')) {
            MCE.addEffect(g, undo, { sq: sq, type: 'immune', duration: 4, owner: MCE.pieceColor(p) });
          }
        }
      }
    }
  },
  moveFilter: function(g, moves) {
    return moves.filter(function(m) {
      if (m.flag !== 'capture' && m.flag !== 'ep') return true;
      return !MCE.hasEffect(g, m.to, 'immune');
    });
  },
  winCondition: function(g) {
    var moves = MCE.variantLegalMoves(g);
    if (moves.length === 0) {
      if (MCE.inCheck(g, g.turn)) return 'checkmate';
      return 'stalemate';
    }
    return null;
  },
  evaluate: function(g, defaultEval) {
    var score = defaultEval(g);
    if (!g.effects) return score;
    for (var i = 0; i < g.effects.length; i++) {
      var eff = g.effects[i];
      if (eff.type !== 'immune') continue;
      var piece = g.board[eff.sq];
      if (!piece) continue;
      if (MCE.pieceColor(piece) === g.turn) score += 80;
      else score -= 80;
    }
    return score;
  },
  statusText: function(g, helpers) {
    if (!g.effects || g.effects.length === 0) return null;
    var count = g.effects.filter(function(e) { return e.type === 'immune'; }).length;
    if (count === 0) return null;
    return helpers.nameFor(g.turn) + ' to move (' + count + ' immune)';
  },
});
