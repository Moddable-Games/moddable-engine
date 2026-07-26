import MCE from '../engine.js';
import { Leaper } from '../movement.js';

const movement = Leaper('bishop');

MCE.registerPiece('f', {
  name: 'Fers',
  category: 'fairy',
  movement: 'One square in any diagonal direction',
  capture: null,
  variants: ['makruk', 'chaturanga', 'shatranj', 'makpong'],
  primitives: [{ type: 'leaper', offsets: 'bishop' }],
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
