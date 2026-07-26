import MCE from '../engine.js';
import { Rider, Leaper, divergent } from '../movement.js';

const movement = divergent(Rider('bishop'), Leaper('knight'));

MCE.registerPiece('h', {
  name: 'Archer',
  category: 'fairy',
  movement: 'Slides any number of squares diagonally (like bishop)',
  capture: 'L-shaped jump (like knight)',
  variants: ['ordaChess'],
  primitives: { divergent: { move: { type: 'rider', dirs: 'bishop' }, capture: { type: 'leaper', offsets: 'knight' } } },
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
