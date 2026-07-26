import MCE from '../engine.js';

MCE.registerRule('en-passant', {
  flags: ['ep', 'double'],

  onMake(g, move, undo) {
    const { from, to, flag } = move;
    if (flag === 'ep') {
      const [fr] = MCE.rc(from, g);
      const [, tc] = MCE.rc(to, g);
      const epCapSq = MCE.sq(fr, tc, g);
      undo.epCaptured = g.board[epCapSq];
      undo.epCapSq = epCapSq;
      undo.capturedAt = epCapSq;
      if (g.pieceData) {
        undo.pieceDataEp = g.pieceData[epCapSq];
        g.pieceData[epCapSq] = null;
      }
      g.board[epCapSq] = null;
    }
    if (flag === 'double') {
      const [fr, fc] = MCE.rc(from, g);
      const [tr] = MCE.rc(to, g);
      g.enPassant = MCE.sq((fr + tr) / 2, fc, g);
    } else {
      g.enPassant = -1;
    }
  },

  onUnmake(g, undo) {
    if (undo.flag === 'ep') {
      g.board[undo.epCapSq] = undo.epCaptured;
      if (g.pieceData && undo.pieceDataEp !== undefined) {
        g.pieceData[undo.epCapSq] = undo.pieceDataEp;
      }
    }
    g.enPassant = undo.enPassant;
  },
});
