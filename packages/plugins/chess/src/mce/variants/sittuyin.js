import MCE from '../engine.js';

MCE.registerPiece('i', {
  genMoves: function(g, from, side) {
    var moves = [];
    var r = MCE.rc(from, g)[0], c = MCE.rc(from, g)[1];
    var fwd = side === MCE.WHITE ? -1 : 1;
    var dirs = [[-1,-1],[-1,1],[1,-1],[1,1],[fwd,0]];
    for (var d = 0; d < dirs.length; d++) {
      var nr = r + dirs[d][0], nc = c + dirs[d][1];
      var coords = MCE.wrapCoords(nr, nc, g);
      nr = coords[0]; nc = coords[1];
      if (!MCE.onBoard(nr, nc, g)) continue;
      var target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isFriendly(target, side, g)) continue;
      moves.push({ from: from, to: target, flag: g.board[target] ? 'capture' : null });
    }
    return moves;
  },
  attacks: function(g, from, target) {
    var fr = MCE.rc(from, g), tr = MCE.rc(target, g);
    var dr = tr[0] - fr[0], dc = tr[1] - fr[1];
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0)) {
      if (Math.abs(dc) === 1) return true;
      var side = MCE.pieceColor(g.board[from]);
      var fwd = side === MCE.WHITE ? -1 : 1;
      return dr === fwd && dc === 0;
    }
    return false;
  }
});

var WHITE_PROMO_SQS = null;
var BLACK_PROMO_SQS = null;

function getPromoSquares(g) {
  if (!WHITE_PROMO_SQS) {
    var wp = ['a8','b7','c6','d5','e5','f6','g7','h8'];
    var bp = ['a1','b2','c3','d4','e4','f3','g2','h1'];
    WHITE_PROMO_SQS = wp.map(function(s) { return MCE.algebraicToSq(s, g); });
    BLACK_PROMO_SQS = bp.map(function(s) { return MCE.algebraicToSq(s, g); });
  }
  return { w: WHITE_PROMO_SQS, b: BLACK_PROMO_SQS };
}

function hasGeneral(g, side) {
  for (var i = 0; i < g.board.length; i++) {
    if (g.board[i] && MCE.pieceType(g.board[i]) === 'f' && MCE.pieceColor(g.board[i]) === side) {
      return true;
    }
  }
  return false;
}

MCE.registerVariant('sittuyin', {
  label: 'Sittuyin',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: '8/8/4pppp/pppp4/4PPPP/PPPP4/8/8 w - - 0 1',
  noCastling: true,
  noEnPassant: true,
  torpedo: false,
  noPromotion: true,
  title: 'Sittuyin (Burmese Chess)',
  description: 'Burmese chess with a placement opening phase. Players freely position pieces on their own half before play begins. Pawns promote only to General on diagonal squares.',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    g.hand = { w: ['r','r','n','n','i','i','f','k'], b: ['r','r','n','n','i','i','f','k'] };
    g.sittuyinPhase = 'placement';
  },
  moveFilter: function(g, moves) {
    var side = g.turn;

    if (g.sittuyinPhase === 'placement') {
      var hand = g.hand[side];
      if (!hand || hand.length === 0) {
        g.sittuyinPhase = 'play';
        return moves;
      }
      var dropMoves = [];
      var uniquePieces = {};
      for (var h = 0; h < hand.length; h++) uniquePieces[hand[h]] = true;
      var pieceTypes = Object.keys(uniquePieces);

      for (var p = 0; p < pieceTypes.length; p++) {
        var pt = pieceTypes[p];
        for (var sq = 0; sq < g.board.length; sq++) {
          if (g.board[sq]) continue;
          var rc = MCE.rc(sq, g);
          var rank = rc[0];
          if (side === MCE.WHITE) {
            if (pt === 'r') { if (rank !== 7) continue; }
            else { if (rank < 5) continue; }
          } else {
            if (pt === 'r') { if (rank !== 0) continue; }
            else { if (rank > 2) continue; }
          }
          dropMoves.push({ from: sq, to: sq, flag: 'action', action: 'drop', dropPiece: pt });
        }
      }
      return dropMoves;
    }

    var promoSqs = getPromoSquares(g);
    var sqs = side === MCE.WHITE ? promoSqs.w : promoSqs.b;
    if (!hasGeneral(g, side)) {
      for (var sq2 = 0; sq2 < g.board.length; sq2++) {
        var piece = g.board[sq2];
        if (!piece || MCE.pieceType(piece) !== 'p' || MCE.pieceColor(piece) !== side) continue;
        if (sqs.indexOf(sq2) === -1) continue;
        moves.push({ from: sq2, to: sq2, flag: 'action', action: 'promote' });
      }
    }
    return moves;
  },
  afterMove: function(g, move, undo) {
    var moverSide = undo.turn;

    if (move.flag === 'action' && move.action === 'drop') {
      var dropChar = move.dropPiece;
      var placed = (moverSide === MCE.WHITE) ? dropChar.toUpperCase() : dropChar;
      MCE.mutateBoard(g, undo, [{ sq: move.to, piece: placed }]);
      undo._handBefore = g.hand[moverSide].slice();
      var idx = g.hand[moverSide].indexOf(dropChar);
      if (idx !== -1) g.hand[moverSide].splice(idx, 1);

      if (g.hand[MCE.WHITE].length === 0 && g.hand[MCE.BLACK].length === 0) {
        g.sittuyinPhase = 'play';
      }
    } else if (move.flag === 'action' && move.action === 'promote') {
      var promoChar = (moverSide === MCE.WHITE) ? 'F' : 'f';
      MCE.mutateBoard(g, undo, [{ sq: move.to, piece: promoChar }]);
    }
  },
  restoreState: function(g, undo) {
    if (undo._handBefore !== undefined) {
      var side = undo.turn;
      g.hand[side] = undo._handBefore;
      g.sittuyinPhase = 'placement';
    }
  },
  evaluate: function(g, defaultEval) {
    if (g.sittuyinPhase === 'placement') {
      var side = g.turn;
      var placed = 8 - (g.hand[side] ? g.hand[side].length : 0);
      return placed * 10;
    }
    var VALS = { p: 100, n: 300, i: 250, f: 200, r: 500, k: 0 };
    var score = 0;
    for (var sq = 0; sq < g.board.length; sq++) {
      var p = g.board[sq];
      if (!p) continue;
      var type = MCE.pieceType(p);
      var val = VALS[type] || 100;
      if (MCE.pieceColor(p) === g.turn) score += val;
      else score -= val;
    }
    return score;
  },
  statusText: function(g, helpers) {
    if (g.sittuyinPhase === 'placement') {
      var side = g.turn;
      var hand = g.hand[side] || [];
      return helpers.nameFor(side) + ' placing (' + hand.length + ' remaining)';
    }
    return null;
  },
});
