import MCE from '../engine.js';
MCE.registerVariant('medusaChess', {
  label: 'Medusa Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Medusa Chess',
  description: 'After the queen moves, all enemy pieces she attacks become petrified for 2 turns (kings are immune). Petrified pieces cannot move. Strategy shifts from capturing to freezing.',
  rule: 'Board: 8x8 - Win: Checkmate',
  afterMove: function(g, move, undo) {
    var piece = g.board[move.to];
    if (!piece) return;
    if (MCE.pieceType(piece) !== 'q') return;
    var side = MCE.pieceColor(piece);
    var opp = (side === MCE.WHITE) ? MCE.BLACK : MCE.WHITE;
    var tempG = Object.assign({}, g, { turn: side });
    tempG.board = g.board;
    var moves = MCE.pseudoLegalMoves(tempG);
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].from !== move.to) continue;
      var target = g.board[moves[i].to];
      if (target && MCE.pieceColor(target) === opp && MCE.pieceType(target) !== 'k') {
        if (!MCE.hasEffect(g, moves[i].to, 'petrify')) {
          MCE.addEffect(g, undo, { sq: moves[i].to, type: 'petrify', duration: 2, owner: side });
        }
      }
    }
  },
  moveFilter: function(g, moves) {
    return moves.filter(function(m) {
      return !MCE.hasEffect(g, m.from, 'petrify');
    });
  },
  evaluate: function(g, defaultEval) {
    var score = defaultEval(g);
    if (!g.effects) return score;
    for (var i = 0; i < g.effects.length; i++) {
      var eff = g.effects[i];
      if (eff.type !== 'petrify') continue;
      var piece = g.board[eff.sq];
      if (!piece) continue;
      var val = { p: 100, n: 320, b: 330, r: 500, q: 900 }[MCE.pieceType(piece)] || 100;
      if (MCE.pieceColor(piece) === g.turn) score -= val * 0.4;
      else score += val * 0.4;
    }
    return score;
  },
  statusText: function(g, helpers) {
    if (!g.effects || g.effects.length === 0) return null;
    var count = g.effects.filter(function(e) { return e.type === 'petrify'; }).length;
    if (count === 0) return null;
    return helpers.nameFor(g.turn) + ' to move (' + count + ' petrified)';
  },
});
