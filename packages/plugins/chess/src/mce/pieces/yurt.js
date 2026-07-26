import MCE from '../engine.js';
import { Leaper, divergent } from '../movement.js';

const movement = divergent(Leaper('bishop'), Leaper('rook'));

MCE.registerPiece('y', {
  name: 'Yurt',
  category: 'fairy',
  movement: 'One square diagonally in any direction',
  capture: 'One square orthogonally (forward, backward, left, right)',
  variants: ['ordaChess'],
  primitives: { divergent: { move: { type: 'leaper', offsets: 'bishop' }, capture: { type: 'leaper', offsets: 'rook' } } },
  genMoves: movement.genMoves,
  attacks: movement.attacks,
});
