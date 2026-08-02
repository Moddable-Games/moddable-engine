import MCE from '../engine.js';
import { Rider, Leaper, divergent } from '../movement.js';

const movement = divergent(Leaper('knight'), Rider('rook'));

MCE.registerPiece('l', {
  name: 'Lancer',
  category: 'fairy',
  movement: 'L-shaped jump (like knight)',
  capture: 'Slides any number of squares orthogonally (like rook)',
  variants: ['ordaChess'],
  primitives: { divergent: { move: { type: 'leaper', offsets: 'knight' }, capture: { type: 'rider', dirs: 'rook' } } },
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
