import MCE from '../engine.js';
import { Leaper } from '../movement.js';

const movement = Leaper('king');

MCE.registerPiece('s', {
  name: 'Sage',
  category: 'compound',
  movement: 'One square in any direction (like king, but not royal)',
  capture: null,
  variants: ['grand'],
  primitives: [{ type: 'leaper', offsets: 'king' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
