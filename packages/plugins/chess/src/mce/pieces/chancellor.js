import MCE from '../engine.js';
import { Rider, Leaper, compose } from '../movement.js';

const movement = compose(Rider('rook'), Leaper('knight'));

MCE.registerPiece('c', {
  name: 'Chancellor',
  category: 'compound',
  movement: 'Slides orthogonally (rook) and L-shaped jump (knight)',
  capture: null,
  variants: ['capablanca', 'grand'],
  primitives: [{ type: 'rider', dirs: 'rook' }, { type: 'leaper', offsets: 'knight' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
