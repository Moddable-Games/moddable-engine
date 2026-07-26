import MCE from '../engine.js';
MCE.registerVariant('horde', {
  group: 'Alternate Rules',
  openingBook: {
    "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq -": ["f5f6", "c5c6", "e4e5", "d4d5"],
    "rnbqkbnr/pppppppp/5P2/1PP2P2/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP b kq -": ["g7f6", "e7e6", "d7d6"],
    "rnbqkbnr/pppppppp/2P5/1P3PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP b kq -": ["b7c6", "d7d6", "e7e5"],
    "rnbqkbnr/pppppppp/8/1PP2PP1/PPPP1PPP/PPPPPPPP/PPPPPPPP/PPPPPPPP b kq -": ["d7d5", "e7e5", "g8f6"],
    "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPP1PPPP/PPPPPPPP/PPPPPPPP b kq -": ["d7d5", "e7e5", "c7c6"],
  },
  label: 'Horde Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: 'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1',
  title: 'Horde Chess',
  description: 'Massively asymmetric — White has 36 pawns filling ranks 1-4, Black has a normal army. Black wins by checkmate or eliminating all White pieces.',
  rule: 'Board: 8×8 · Win: Checkmate (Black) or eliminate horde (Black)',
  evaluate: function(g, defaultEval) {
    var whitePawns = 0, blackMaterial = 0;
    var VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
    for (var i = 0; i < g.board.length; i++) {
      var p = g.board[i];
      if (!p) continue;
      if (MCE.pieceColor(p) === MCE.WHITE) {
        whitePawns++;
        var rank = MCE.rc(i, g)[0];
        if (g.turn === MCE.WHITE) {
          whitePawns += (7 - rank) * 0.1;
        }
      } else {
        blackMaterial += VALS[MCE.pieceType(p)] || 100;
      }
    }
    if (g.turn === MCE.WHITE) {
      return whitePawns * 30 - blackMaterial * 0.3;
    } else {
      return blackMaterial * 0.3 - whitePawns * 30;
    }
  },
  winCondition: function(g) {
    var whiteHasPieces = g.board.some(function(p) {
      return p && MCE.pieceColor(p) === MCE.WHITE;
    });
    if (!whiteHasPieces) return 'horde-b';
    if (g.turn === MCE.WHITE) {
      if (MCE.legalMoves(g).length === 0) return 'horde-b';
    }
    return null;
  },
  statusText: function(g, helpers) {
    if (!helpers.gameOver) return null;
    if (helpers.variantStatus === 'horde-b') {
      return ((function(n){return n+' '+(helpers.winsText?helpers.winsText(n):'wins')})(helpers.nameFor('b'))) + ' — horde eliminated!';
    }
    return null;
  },
});
