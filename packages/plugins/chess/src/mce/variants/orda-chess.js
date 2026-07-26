import MCE from '../engine.js';
MCE.registerPiece('y', {
  genMoves: function(g, from, side) {
    var moves = [];
    var r = MCE.rc(from, g)[0], c = MCE.rc(from, g)[1];
    var moveDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (var i = 0; i < moveDirs.length; i++) {
      var nr = r + moveDirs[i][0], nc = c + moveDirs[i][1];
      if (!MCE.onBoard(nr, nc, g)) continue;
      var target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isFriendly(target, side, g)) continue;
      if (g.board[target]) continue;
      moves.push({ from: from, to: target, flag: null });
    }
    var capDirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var i = 0; i < capDirs.length; i++) {
      var nr = r + capDirs[i][0], nc = c + capDirs[i][1];
      if (!MCE.onBoard(nr, nc, g)) continue;
      var target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isEnemy(target, side, g)) {
        moves.push({ from: from, to: target, flag: 'capture' });
      }
    }
    return moves;
  },
  attacks: function(g, from, target) {
    var fr = MCE.rc(from, g)[0], fc = MCE.rc(from, g)[1];
    var tr = MCE.rc(target, g)[0], tc = MCE.rc(target, g)[1];
    var dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);
    return (dr + dc === 1);
  }
});

MCE.registerPiece('l', {
  genMoves: function(g, from, side) {
    var moves = [];
    var r = MCE.rc(from, g)[0], c = MCE.rc(from, g)[1];
    var moveDirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var d = 0; d < moveDirs.length; d++) {
      var nr = r + moveDirs[d][0], nc = c + moveDirs[d][1];
      while (MCE.onBoard(nr, nc, g)) {
        var target = MCE.sq(nr, nc, g);
        if (g.board[target]) break;
        moves.push({ from: from, to: target, flag: null });
        nr += moveDirs[d][0]; nc += moveDirs[d][1];
      }
    }
    var capOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (var i = 0; i < capOffsets.length; i++) {
      var nr = r + capOffsets[i][0], nc = c + capOffsets[i][1];
      if (!MCE.onBoard(nr, nc, g)) continue;
      var target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isEnemy(target, side, g)) {
        moves.push({ from: from, to: target, flag: 'capture' });
      }
    }
    return moves;
  },
  attacks: function(g, from, target) {
    var fr = MCE.rc(from, g)[0], fc = MCE.rc(from, g)[1];
    var tr = MCE.rc(target, g)[0], tc = MCE.rc(target, g)[1];
    var dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);
    return (dr * dc === 2 && dr + dc === 3);
  }
});

MCE.registerPiece('h', {
  genMoves: function(g, from, side) {
    var moves = [];
    var r = MCE.rc(from, g)[0], c = MCE.rc(from, g)[1];
    var moveDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (var d = 0; d < moveDirs.length; d++) {
      var nr = r + moveDirs[d][0], nc = c + moveDirs[d][1];
      while (MCE.onBoard(nr, nc, g)) {
        var target = MCE.sq(nr, nc, g);
        if (g.board[target]) break;
        moves.push({ from: from, to: target, flag: null });
        nr += moveDirs[d][0]; nc += moveDirs[d][1];
      }
    }
    var capOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (var i = 0; i < capOffsets.length; i++) {
      var nr = r + capOffsets[i][0], nc = c + capOffsets[i][1];
      if (!MCE.onBoard(nr, nc, g)) continue;
      var target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isEnemy(target, side, g)) {
        moves.push({ from: from, to: target, flag: 'capture' });
      }
    }
    return moves;
  },
  attacks: function(g, from, target) {
    var fr = MCE.rc(from, g)[0], fc = MCE.rc(from, g)[1];
    var tr = MCE.rc(target, g)[0], tc = MCE.rc(target, g)[1];
    var dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);
    return (dr * dc === 2 && dr + dc === 3);
  }
});

var KING_DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
var KNIGHT_JUMPS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];

MCE.registerPiece('w', {
  genMoves: function(g, from, side) {
    var moves = [];
    var r = MCE.rc(from, g)[0], c = MCE.rc(from, g)[1];
    var allDirs = KING_DIRS.concat(KNIGHT_JUMPS);
    for (var i = 0; i < allDirs.length; i++) {
      var nr = r + allDirs[i][0], nc = c + allDirs[i][1];
      if (!MCE.onBoard(nr, nc, g)) continue;
      var target = MCE.sq(nr, nc, g);
      if (g.board[target] && MCE.isFriendly(target, side, g)) continue;
      moves.push({ from: from, to: target, flag: g.board[target] ? 'capture' : null });
    }
    return moves;
  },
  attacks: function(g, from, target) {
    var fr = MCE.rc(from, g)[0], fc = MCE.rc(from, g)[1];
    var tr = MCE.rc(target, g)[0], tc = MCE.rc(target, g)[1];
    var dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);
    if (dr <= 1 && dc <= 1 && (dr + dc > 0)) return true;
    return (dr * dc === 2 && dr + dc === 3);
  }
});

MCE.registerVariant('ordaChess', {
  openingBook: {
    "lhwykwhl/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR w KQ -": ["e2e4", "d2d4", "g1f3", "c2c4"],
    "lhwykwhl/8/pppppppp/8/4P3/PPPP1PPP/8/RNBQKBNR b KQ -": ["e6e5", "d6d5", "c6c5"],
    "lhwykwhl/8/pppppppp/8/3P4/PPP1PPPP/8/RNBQKBNR b KQ -": ["d6d5", "e6e5", "f6f5"],
    "lhwykwhl/8/pppp1ppp/4p3/4P3/PPPP1PPP/8/RNBQKBNR w KQ -": ["g1f3", "d2d4", "f1c4"],
    "lhwykwhl/8/ppp1pppp/3p4/3P4/PPP1PPPP/8/RNBQKBNR w KQ -": ["c2c4", "e2e4", "g1f3"],
  },
  label: 'Orda Chess',
  group: 'Asymmetric',
  rows: 8,
  cols: 8,
  fen: 'lhwykwhl/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR w KQ - 0 1',
  noCastling: false,
  title: 'Orda Chess',
  description: 'Asymmetric: White plays standard chess. Black commands the Horde — Yurt (moves diagonal, captures orthogonal), Lancer (moves like rook, captures like knight), Archer (moves like bishop, captures like knight), Kheshig (moves as king or knight).',
  rule: 'Board: 8×8 · Win: Checkmate',
  pieceRoles: { y: 'y', l: 'l', h: 'h', w: 'w' },
});
