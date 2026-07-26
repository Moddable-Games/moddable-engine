import MCE from '../engine.js';
import { Rider, Leaper, divergent } from '../movement.js';

const movement = divergent(Rider('rook'), Leaper('knight'));

MCE.registerPiece('l', {
  name: 'Lancer',
  category: 'fairy',
  movement: 'Slides any number of squares orthogonally (like rook)',
  capture: 'L-shaped jump (like knight)',
  variants: ['ordaChess'],
  primitives: { divergent: { move: { type: 'rider', dirs: 'rook' }, capture: { type: 'leaper', offsets: 'knight' } } },
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
