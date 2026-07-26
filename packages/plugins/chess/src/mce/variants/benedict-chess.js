import MCE from '../engine.js';
MCE.registerVariant('benedictChess', {
  label: 'Benedict',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  title: 'Benedict Chess',
  description: 'Pieces never capture — instead, after your move, any enemy piece your moved piece now attacks is converted to your colour. Win by converting the opponent\'s king.',
  rule: 'Board: 8×8 · Win: Convert king',
  moveFilter: function(g, moves) {
    return moves.filter(function(m) {
      return !g.board[m.to] && m.flag !== 'ep';
    });
  },
  afterMove: function(g, move, undo) {
    var piece = g.board[move.to];
    if (!piece) return;
    var side = MCE.pieceColor(piece);
    var opp = side === MCE.WHITE ? MCE.BLACK : MCE.WHITE;
    var tempG = Object.assign({}, g, { turn: side });
    tempG.board = g.board;
    var moves = MCE.pseudoLegalMoves(tempG);
    var attacked = new Set();
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].from === move.to) {
        attacked.add(moves[i].to);
      }
    }
    var mutations = [];
    attacked.forEach(function(sq) {
      var target = g.board[sq];
      if (target && MCE.pieceColor(target) === opp) {
        if (target === target.toUpperCase()) {
          mutations.push({ sq: sq, piece: target.toLowerCase() });
        } else {
          mutations.push({ sq: sq, piece: target.toUpperCase() });
        }
      }
    });
    if (mutations.length) {
      MCE.mutateBoard(g, undo, mutations);
    }
  },
  evaluate: function(g, defaultEval) {
    var material = defaultEval(g);
    var myCount = 0, oppCount = 0;
    var oppHasKing = false;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceColor(p) === g.turn) myCount++;
      else {
        oppCount++;
        if (MCE.pieceType(p) === 'k') oppHasKing = true;
      }
    }
    if (!oppHasKing) return 100000;
    return material + (myCount - oppCount) * 50;
  },
  winCondition: function(g) {
    var whiteKing = false;
    var blackKing = false;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceType(p) === 'k') {
        if (MCE.pieceColor(p) === MCE.WHITE) whiteKing = true;
        else blackKing = true;
      }
    }
    if (!whiteKing) return 'benedict-b';
    if (!blackKing) return 'benedict-w';
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status && status.startsWith('benedict-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'benedict-w' ? 'w' : 'b'))) + ' — king converted!';
    }
    return null;
  },
});
