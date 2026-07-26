import MCE from '../engine.js';
import { Leaper } from '../movement.js';

const movement = Leaper('elephant');

MCE.registerPiece('e', {
  name: 'Elephant',
  category: 'fairy',
  movement: 'Leaps exactly two squares diagonally (no blocking)',
  capture: null,
  variants: ['chaturanga'],
  primitives: [{ type: 'leaper', offsets: 'elephant' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
