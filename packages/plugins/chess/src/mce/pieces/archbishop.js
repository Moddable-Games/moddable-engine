import MCE from '../engine.js';
import { Rider, Leaper, compose } from '../movement.js';

const movement = compose(Rider('bishop'), Leaper('knight'));

MCE.registerPiece('a', {
  name: 'Archbishop',
  category: 'compound',
  movement: 'Slides diagonally (bishop) and L-shaped jump (knight)',
  capture: null,
  variants: ['capablanca', 'grand'],
  primitives: [{ type: 'rider', dirs: 'bishop' }, { type: 'leaper', offsets: 'knight' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
