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
export { chigorin, endgameChess, pawnsOnly, peasantsRevolt, halfChess, minichess, dianaChess, pettyChess, upsideDown } from './setup-only.js'
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

const DICE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

export const diceChess = {
  key: 'diceChess',

  moveFilter(moves, state) {
    const die1 = Math.floor(Math.random() * 6)
    const die2 = Math.floor(Math.random() * 6)
    if (die1 === die2) return moves
    const allowed = new Set([DICE_TYPES[die1], DICE_TYPES[die2]])
    const filtered = moves.filter(m => {
      const piece = state.board[m.from]
      return piece && allowed.has(piece.type)
    })
    return filtered
  },
}

function randomBackRank960() {
  const pieces = Array(8).fill(null)
  const empty = () => pieces.map((p, i) => p === null ? i : -1).filter(i => i >= 0)
  const darkSqs = [0, 2, 4, 6], lightSqs = [1, 3, 5, 7]
  pieces[darkSqs[Math.floor(Math.random() * 4)]] = 'b'
  pieces[lightSqs[Math.floor(Math.random() * 4)]] = 'b'
  let e = empty(); pieces[e[Math.floor(Math.random() * e.length)]] = 'q'
  e = empty(); pieces[e[Math.floor(Math.random() * e.length)]] = 'n'
  e = empty(); pieces[e[Math.floor(Math.random() * e.length)]] = 'n'
  e = empty()
  pieces[e[0]] = 'r'; pieces[e[1]] = 'k'; pieces[e[2]] = 'r'
  return pieces.join('')
}

export const chess960 = {
  key: 'chess960',
  setup() {
    const rank = randomBackRank960()
    return rank + '/pppppppp/8/8/8/8/PPPPPPPP/' + rank.toUpperCase()
  },
}
