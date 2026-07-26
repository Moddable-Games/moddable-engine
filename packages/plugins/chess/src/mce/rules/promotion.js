import MCE from '../engine.js';

MCE.registerRule('promotion', {
  flags: ['promo'],

  onMake(g, move, undo) {
    if (move.flag === 'promo') {
      g.board[move.to] = g.turn === MCE.WHITE ? move.promo.toUpperCase() : move.promo;
    }
  },

  onUnmake(g, undo) {
    // unmake is handled by the generic board restore (piece goes back to from)
  },
});
