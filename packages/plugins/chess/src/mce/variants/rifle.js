import MCE from '../engine.js';
MCE.registerVariant('rifle', {
  group: 'Tactical',
  openingBook: {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -": ["e2e4", "d2d4", "g1f3", "b1c3"],
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3": ["e7e6", "d7d6", "g8f6", "b8c6"],
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3": ["d7d6", "e7e6", "g8f6"],
    "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d4", "g1f3", "b1c3"],
    "rnbqkbnr/ppp1pppp/3p4/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -": ["d2d4", "g1f3", "f1c4"],
  },
  label: 'Rifle',
  group: 'Tactical',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Rifle Chess',
  description: 'When you capture a piece, your piece stays on its original square — it \'shoots\' the target from a distance.',
  rule: 'Board: 8×8 · Win: Checkmate',
  beforeMove: function(g, move, undo) {
    if (g.board[move.to] || move.flag === 'ep') {
      if (g.board[move.to]) {
        g.board[move.to] = null;
        if (g.pieceData) g.pieceData[move.to] = null;
      }
      g.board[move.from] = undo.piece;
      if (g.pieceData) g.pieceData[move.from] = undo.pieceData || null;
    } else {
      g.board[move.to] = undo.piece;
      g.board[move.from] = null;
      if (g.pieceData) {
        g.pieceData[move.to] = undo.pieceData || null;
        g.pieceData[move.from] = null;
      }
    }
  },
});
