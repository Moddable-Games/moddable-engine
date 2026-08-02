import MCE from '../engine.js';
import { Leaper } from '../movement.js';

const schleichMovement = Leaper('rook');
const mannMovement = Leaper('king');

MCE.registerPiece('t', {
  name: 'Schleich',
  category: 'fairy',
  movement: 'One step orthogonally only',
  capture: null,
  variants: ['courier'],
  primitives: [{ type: 'leaper', offsets: [[-1,0],[1,0],[0,-1],[0,1]] }],
  genMoves: schleichMovement.genMoves,
  attacks: schleichMovement.attacks,
});

MCE.registerPiece('d', {
  name: 'Mann',
  category: 'fairy',
  movement: 'One step in any direction (non-royal king)',
  capture: null,
  variants: ['courier'],
  primitives: [{ type: 'leaper', offsets: 'king' }],
  genMoves: mannMovement.genMoves,
  attacks: mannMovement.attacks,
});

MCE.registerVariant('courier', {
  label: 'Courier Chess',
  group: 'Large Boards',
  rows: 8,
  cols: 12,
  fen: 'rnebdkftbenr/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNEBDKFXBENR w - - 0 1',
  noCastling: true,
  noEnPassant: true,
  noDoubleStep: true,
  promotionPieces: ['f'],
  title: 'Courier Chess',
  description: 'Medieval variant (1202). 12×8 board. Courier slides diagonally (modern bishop). Mann moves one step any direction (non-royal). Schleich moves one step orthogonally only.',
  rule: 'Board: 12×8 · Win: Checkmate',
});
