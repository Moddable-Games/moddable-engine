import MCE from '../engine.js';
MCE.registerVariant('atomic', {
  group: 'Tactical',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["g1f3", "e2e4", "d2d4"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e6", "d7d5", "g8f6"],
    "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -": ["f7f6", "d7d5", "e7e6"],
    "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d4", "g1f3", "d2d3"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["e7e6", "d7d5", "f7f6"],
    "rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3": ["d7d5", "g8f6", "f7f6"],
  },
  label: 'Atomic',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  noCheck: true,
  noRepetitionDraw: true,
  title: 'Atomic Chess',
  description: 'Captures cause explosions that destroy all non-pawn pieces on adjacent squares, including the capturer. If a king is caught in the blast, that side loses.',
  rule: 'Board: 8×8 · Win: Explode opponent\'s king',
  evaluate: function(g, defaultEval) {
    var whiteKingSq = -1, blackKingSq = -1;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (p && MCE.pieceType(p) === 'k') {
        if (MCE.pieceColor(p) === MCE.WHITE) whiteKingSq = i;
        else blackKingSq = i;
      }
    }
    if (whiteKingSq === -1) return g.turn === MCE.BLACK ? 100000 : -100000;
    if (blackKingSq === -1) return g.turn === MCE.WHITE ? 100000 : -100000;
    var material = defaultEval(g);
    var score = material;
    var targetKingSq = (g.turn === MCE.WHITE) ? blackKingSq : whiteKingSq;
    var tkRc = MCE.rc(targetKingSq, g);
    for (var j = 0; j < g.board.length; j++) {
      var piece = g.board[j];
      if (!piece || MCE.pieceColor(piece) !== g.turn) continue;
      if (MCE.pieceType(piece) === 'k') continue;
      var rc = MCE.rc(j, g);
      var dist = Math.abs(rc[0] - tkRc[0]) + Math.abs(rc[1] - tkRc[1]);
      if (dist <= 2) score += 200;
      else if (dist <= 4) score += 80;
    }
    return score;
  },
  beforeMove: function(g, move, undo) {
    if (g.board[move.to] && move.flag !== 'ep') {
      g.board[move.to] = undo.piece;
      g.board[move.from] = null;
      if (g.pieceData) {
        g.pieceData[move.to] = undo.pieceData || null;
        g.pieceData[move.from] = null;
      }
      g.board[move.to] = null;
      if (g.pieceData) g.pieceData[move.to] = null;
      undo.exploded = [];
      var rc = MCE.rc(move.to, g);
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          var r = rc[0] + dr;
          var c = rc[1] + dc;
          if (!MCE.onBoard(r, c, g)) continue;
          var sq = MCE.sq(r, c, g);
          if (g.board[sq] && MCE.pieceType(g.board[sq]) !== 'p') {
            undo.exploded.push({ sq: sq, piece: g.board[sq] });
            g.board[sq] = null;
            if (g.pieceData) g.pieceData[sq] = null;
          }
        }
      }
    } else {
      g.board[move.to] = undo.piece;
      g.board[move.from] = null;
      if (g.pieceData) {
        g.pieceData[move.to] = undo.pieceData || null;
        g.pieceData[move.from] = null;
      }
    }
  },
  winCondition: function(g) {
    var whiteKing = false, blackKing = false;
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceType(p) === 'k') {
        if (MCE.pieceColor(p) === MCE.WHITE) whiteKing = true;
        else blackKing = true;
      }
    }
    if (!whiteKing && !blackKing) return 'atomic-draw';
    if (!whiteKing) return 'atomic-b';
    if (!blackKing) return 'atomic-w';
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    var status = helpers.variantStatus;
    if (status === 'atomic-draw') return 'Draw — both kings destroyed!';
    if (status && status.startsWith('atomic-')) {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor(status === 'atomic-w' ? 'w' : 'b'))) + ' — king exploded!';
    }
    return null;
  },
  explosionCaptures: function(g, move) {
    var results = [];
    var rc = MCE.rc(move.to, g);
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = rc[0] + dr, nc = rc[1] + dc;
        if (!MCE.onBoard(nr, nc, g)) continue;
        var sq = MCE.sq(nr, nc, g);
        var p = g.board[sq];
        if (p && MCE.pieceType(p) !== 'p') {
          var color = MCE.pieceColor(p);
          results.push({ piece: p, capturedBy: color === MCE.WHITE ? MCE.BLACK : MCE.WHITE });
        }
      }
    }
    var mover = g.board[move.from];
    if (mover && MCE.pieceType(mover) !== 'p') {
      var mColor = MCE.pieceColor(mover);
      results.push({ piece: mover, capturedBy: mColor === MCE.WHITE ? MCE.BLACK : MCE.WHITE });
    }
    return results;
  },
});
