import MCE from '../engine.js';
MCE.registerVariant('antichess', {
  group: 'Alternate Rules',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e3", "b2b4", "g2g4"],
    "rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR b KQkq -": ["b7b5", "b7b6", "d7d5"],
    "rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq -": ["e7e5", "d7d5", "c7c5"],
    "rnbqkbnr/pppppppp/8/8/6P1/8/PPPPPP1P/RNBQKBNR b KQkq -": ["e7e5", "d7d5", "h7h5"],
    "rnbqkbnr/p1pppppp/1p6/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq -": ["f1b5", "d1g4"],
    "rnbqkbnr/ppp1pppp/8/3p4/8/4P3/PPPP1PPP/RNBQKBNR w KQkq -": ["f1b5", "d1h5"],
  },
  label: 'Antichess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  title: 'Antichess',
  description: 'Captures are mandatory. The goal is to lose all your pieces. No check, no castling — the king is just another piece.',
  rule: 'Board: 8×8 · Win: Lose all pieces or get stalemated',
  stalemateMeaning: 'win',
  moveFilter: function(g, moves) {
    var captures = moves.filter(function(m) {
      return g.board[m.to] || m.flag === 'ep';
    });
    return captures.length > 0 ? captures : moves;
  },
  evaluate: function(g) {
    var score = 0;
    var myCount = 0, oppCount = 0;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceColor(p) === g.turn) myCount++;
      else oppCount++;
    }
    score = (oppCount - myCount) * 200;
    if (myCount === 0) score = 100000;
    return score;
  },
  winCondition: function(g) {
    var hasPiece = false;
    for (var i = 0; i < g.board.length; i++) {
      if (g.board[i] && MCE.pieceColor(g.board[i]) === g.turn) {
        hasPiece = true;
        break;
      }
    }
    if (!hasPiece) return 'antichess-' + g.turn;
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('antichess-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'antichess-w' ? 'w' : 'b'))) + ' — lost all pieces!';
    }
    return null;
  },
});
