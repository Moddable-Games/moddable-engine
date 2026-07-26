import MCE from '../engine.js';
import { Rider } from '../movement.js';

const movement = Rider('bishop');

MCE.registerPiece('b', {
  name: 'Bishop',
  category: 'standard',
  movement: 'Slides any number of squares diagonally',
  capture: null,
  variants: ['standard', 'capablanca', 'grand'],
  primitives: [{ type: 'rider', dirs: 'bishop' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
