import MCE from '../engine.js';
import { Rider } from '../movement.js';

const movement = Rider('queen');

MCE.registerPiece('q', {
  name: 'Queen',
  category: 'standard',
  movement: 'Slides any number of squares in any direction (orthogonal + diagonal)',
  capture: null,
  variants: ['standard', 'capablanca', 'grand'],
  primitives: [{ type: 'rider', dirs: 'queen' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
