import MCE from '../engine.js';
import { Rider, Leaper, compose } from '../movement.js';

const movement = compose(Rider('queen'), Leaper('knight'));

MCE.registerPiece('m', {
  name: 'Maharaja',
  category: 'compound',
  movement: 'Slides in any direction (queen) and L-shaped jump (knight)',
  capture: null,
  variants: ['maharaja'],
  primitives: [{ type: 'rider', dirs: 'queen' }, { type: 'leaper', offsets: 'knight' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
