import MCE from '../engine.js';
import { Rider, Leaper, divergent } from '../movement.js';

const movement = divergent(Leaper('knight'), Rider('bishop'));

MCE.registerPiece('h', {
  name: 'Archer',
  category: 'fairy',
  movement: 'L-shaped jump (like knight)',
  capture: 'Slides any number of squares diagonally (like bishop)',
  variants: ['ordaChess'],
  primitives: { divergent: { move: { type: 'leaper', offsets: 'knight' }, capture: { type: 'rider', dirs: 'bishop' } } },
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
