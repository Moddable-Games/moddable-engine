import MCE from '../engine.js';
import { Leaper, compose } from '../movement.js';

const movement = compose(Leaper('king'), Leaper('knight'));

MCE.registerPiece('w', {
  name: 'Kheshig',
  category: 'compound',
  movement: 'One square in any direction (king) or L-shaped jump (knight)',
  capture: null,
  variants: ['ordaChess'],
  primitives: [{ type: 'leaper', offsets: 'king' }, { type: 'leaper', offsets: 'knight' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
