import MCE from '../engine.js';
import { Rider } from '../movement.js';

const movement = Rider('rook');

MCE.registerPiece('r', {
  name: 'Rook',
  category: 'standard',
  movement: 'Slides any number of squares orthogonally',
  capture: null,
  variants: ['standard', 'capablanca', 'grand'],
  primitives: [{ type: 'rider', dirs: 'rook' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
