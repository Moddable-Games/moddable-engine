import MCE from '../engine.js';

MCE.registerRule('castling', {
  flags: ['castle-k', 'castle-q'],

  onMake(g, move, undo) {
    const { from, flag } = move;
    const piece = undo.piece;
    const [row] = MCE.rc(from, g);
    const side = undo.turn;
    const sideKey = side === MCE.WHITE ? 'w' : 'b';
    const rsc = g.rookStartCols;
    let rookFromCol, rookToCol;
    if (flag === 'castle-k') {
      rookFromCol = rsc ? rsc[sideKey].k : g.cols - 1;
      rookToCol = 5;
    } else {
      rookFromCol = rsc ? rsc[sideKey].q : 0;
      rookToCol = 3;
    }
    const rookFrom = MCE.sq(row, rookFromCol, g);
    const rookTo = MCE.sq(row, rookToCol, g);
    const rookPiece = g.board[rookFrom];
    const rookPD = g.pieceData ? g.pieceData[rookFrom] : null;
    undo.rookFrom = rookFrom;
    undo.rookTo = rookTo;
    undo.rookPiece = rookPiece;
    g.board[from] = null;
    g.board[rookFrom] = null;
    if (g.pieceData) { g.pieceData[from] = null; g.pieceData[rookFrom] = null; }
    g.board[move.to] = piece;
    g.board[rookTo] = rookPiece;
    if (g.pieceData) { g.pieceData[move.to] = undo.pieceDataFrom; g.pieceData[rookTo] = rookPD; }
  },

  onUnmake(g, undo) {
    const { from, to, piece, flag } = undo;
    g.board[to] = null;
    g.board[undo.rookTo] = null;
    if (g.pieceData) { g.pieceData[to] = null; g.pieceData[undo.rookTo] = null; }
    g.board[from] = piece;
    g.board[undo.rookFrom] = undo.rookPiece;
    if (g.pieceData) {
      g.pieceData[from] = undo.pieceDataFrom;
      g.pieceData[undo.rookFrom] = undo.pieceDataTo;
    }
  },

  updateState(g, from, to, piece) {
    const royal = g.royalPiece || 'k';
    if (piece === royal.toUpperCase()) { g.castling.K = false; g.castling.Q = false; }
    if (piece === royal.toLowerCase()) { g.castling.k = false; g.castling.q = false; }
    const rsc = g.rookStartCols;
    const wRookK = MCE.sq(g.rows - 1, rsc ? rsc.w.k : g.cols - 1, g);
    const wRookQ = MCE.sq(g.rows - 1, rsc ? rsc.w.q : 0, g);
    const bRookK = MCE.sq(0, rsc ? rsc.b.k : g.cols - 1, g);
    const bRookQ = MCE.sq(0, rsc ? rsc.b.q : 0, g);
    if (from === wRookK || to === wRookK) g.castling.K = false;
    if (from === wRookQ || to === wRookQ) g.castling.Q = false;
    if (from === bRookK || to === bRookK) g.castling.k = false;
    if (from === bRookQ || to === bRookQ) g.castling.q = false;
  },
});
