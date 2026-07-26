import MCE from '../engine.js';
MCE.registerVariant('pieceTest', {
  label: 'Piece Test',
  group: 'Dev',
  rows: 8,
  cols: 8,
  fen: 'pnbrqk2/acsm1w2/fgeyhl1i/8/8/FGEYHL1I/ACSM1W2/PNBRQK2 w - - 0 1',
  noCastling: true,
  title: 'Piece Test',
  description: 'Dev-only: all piece glyphs on one board.',
  rule: 'Board: 8×8',
});
