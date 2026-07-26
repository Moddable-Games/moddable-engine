import MCE from '../engine.js';
import { Leaper } from '../movement.js';

const movement = Leaper('bishop');

MCE.registerPiece('i', {
  name: 'Sit',
  category: 'fairy',
  movement: 'One square in any diagonal direction',
  capture: null,
  variants: ['sittuyin'],
  primitives: [{ type: 'leaper', offsets: 'bishop' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
