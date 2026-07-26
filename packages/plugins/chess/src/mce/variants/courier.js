import MCE from '../engine.js';
MCE.registerVariant('courier', {
  label: 'Courier Chess',
  group: 'Large Boards',
  rows: 8,
  cols: 12,
  fen: 'rnebfsksbenr/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNEBFSKSBENR w - - 0 1',
  title: 'Courier Chess',
  description: 'Medieval German variant from the 1200s. Uses a 12-column board with extra bishops and Sage pieces (move one step in any direction, non-royal).',
  rule: 'Board: 12×8 · Win: Checkmate',
});
