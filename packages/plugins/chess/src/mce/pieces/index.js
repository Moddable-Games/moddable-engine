import MCE from '../engine.js';

import './pawn.js';
import './knight.js';
import './bishop.js';
import './rook.js';
import './queen.js';
import './king.js';

import './fers.js';
import './khon.js';
import './elephant.js';
import './yurt.js';
import './lancer.js';
import './archer.js';
import './kheshig.js';
import './sit.js';
import './archbishop.js';
import './chancellor.js';
import './sage.js';
import './maharaja.js';

const registry = MCE.getPieceRegistry();

export const PIECES = {};

for (const [char, handler] of Object.entries(registry)) {
  PIECES[char] = {
    char,
    name: handler.name || char.toUpperCase(),
    category: handler.category || 'unknown',
    movement: handler.movement || null,
    capture: handler.capture || null,
    variants: handler.variants || [],
  };
}

export const PIECE_NAMES = Object.fromEntries(
  Object.entries(PIECES).map(([k, v]) => [k, v.name])
);

export function getPieceInfo(char) {
  return PIECES[char] || null;
}

Object.assign(MCE, { PIECES, PIECE_NAMES, getPieceInfo });
