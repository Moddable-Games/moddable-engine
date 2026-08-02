export { standard } from './standard.js'
export { noCastling } from './no-castling.js'
export { torpedo } from './torpedo.js'
export { threeCheck } from './three-check.js'
export { fiveCheck } from './five-check.js'
export { kingOfTheHill } from './king-of-the-hill.js'
export { racingKings } from './racing-kings.js'
export { antichess } from './antichess.js'
export { capablanca } from './capablanca.js'
export { losAlamos } from './los-alamos.js'
export { horde } from './horde.js'
export { stalemateWins } from './stalemate-wins.js'
export { checklessChess } from './checkless-chess.js'
export { extinction, singleCheck, codrus, omnicide, breakthrough, shatar } from './win-condition.js'
export { giveaway, suicideChess, noRetreat, patrolChess, makpong, gridChess, madrasiChess, weakChess } from './filter-variants.js'
export { poisonChess, medusaChess, immunizationChess } from './effects.js'
export { einsteinChess, andernachChess, benedictChess, recruitmentChess, absorptionChess } from './mutation.js'
export { marseillais, monsterChess, progressive, berserkChess } from './multi-move.js'
export { chigorin, endgameChess, pawnsOnly, peasantsRevolt, halfChess, minichess, dianaChess, pettyChess } from './setup-only.js'
export { almostChess, amazonChess, grand, knightmate, maharaja, hoppelPoppel, berolinaChess, leganChess, ordaChess } from './custom-pieces.js'
export { rifle, atomic, displacementChess } from './before-move.js'
export { shatranj, chaturanga, makruk, courier } from './historical.js'

export const cylinderChess = {
  key: 'cylinderChess',
  topology: { type: 'grid', rows: 8, cols: 8, wrap: 'files' },
}

export const toroidalChess = {
  key: 'toroidalChess',
  setup: 'pppppppp/rnbqkbnr/pppppppp/8/8/PPPPPPPP/RNBQKBNR/PPPPPPPP',
  castling: false,
  enPassant: false,
  topology: { type: 'grid', rows: 8, cols: 8, wrap: 'torus' },
}
