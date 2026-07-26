import MCE from '../engine.js';
import { Leaper } from '../movement.js';

const movement = Leaper('knight');

MCE.registerPiece('n', {
  name: 'Knight',
  category: 'standard',
  movement: 'L-shaped jump: two squares in one direction, one square perpendicular',
  capture: null,
  variants: ['standard', 'capablanca', 'grand'],
  primitives: [{ type: 'leaper', offsets: 'knight' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
