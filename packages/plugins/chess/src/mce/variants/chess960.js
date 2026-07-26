import MCE from '../engine.js';

function detectRookStartCols(g) {
  var row = g.rows - 1;
  var kingCol = -1;
  var rookCols = [];
  for (var c = 0; c < g.cols; c++) {
    var p = g.board[MCE.sq(row, c, g)];
    if (p && MCE.pieceType(p) === 'k' && MCE.pieceColor(p) === MCE.WHITE) kingCol = c;
    if (p && MCE.pieceType(p) === 'r' && MCE.pieceColor(p) === MCE.WHITE) rookCols.push(c);
  }
  var qRook = -1, kRook = -1;
  for (var i = 0; i < rookCols.length; i++) {
    if (rookCols[i] < kingCol) qRook = rookCols[i];
    else kRook = rookCols[i];
  }
  return { w: { k: kRook, q: qRook }, b: { k: -1, q: -1 } };
}

function detectBlackRookCols(g) {
  var kingCol = -1;
  var rookCols = [];
  for (var c = 0; c < g.cols; c++) {
    var p = g.board[MCE.sq(0, c, g)];
    if (p && MCE.pieceType(p) === 'k' && MCE.pieceColor(p) === MCE.BLACK) kingCol = c;
    if (p && MCE.pieceType(p) === 'r' && MCE.pieceColor(p) === MCE.BLACK) rookCols.push(c);
  }
  var qRook = -1, kRook = -1;
  for (var i = 0; i < rookCols.length; i++) {
    if (rookCols[i] < kingCol) qRook = rookCols[i];
    else kRook = rookCols[i];
  }
  return { k: kRook, q: qRook };
}

MCE.registerVariant('chess960', {
  group: 'Classic',
  label: 'Fischer Random (960)',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Fischer Random (Chess960)',
  description: 'Standard rules but the back rank is randomised from 960 possible positions. Bishops on opposite colours, king between rooks.',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    MCE.loadFEN(g, MCE.randomFEN960());
    g.positionHistory = [MCE.positionKey(g)];
    var cols = detectRookStartCols(g);
    cols.b = detectBlackRookCols(g);
    g.rookStartCols = cols;
  },
});
