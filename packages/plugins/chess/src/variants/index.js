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
export { shatranj, chaturanga, makruk, courier, sittuyin } from './historical.js'

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

import { createRng } from '../../../../core/src/rng.js'
import { createStandardDice } from '../../../../component-dice/src/standard-dice.js'

const DICE_TYPES = [null, 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king']
const dicePair = createStandardDice({ count: 2, faces: 6 })

export const diceChess = {
  key: 'diceChess',

  moveFilter(moves, state) {
    const seed = (state.halfmoveClock || 0) * 97 + (state.fullmoveNumber || 1) * 31 + 7
    const rng = createRng(seed)
    const roll = dicePair.roll(rng)
    if (roll[0] === roll[1]) return moves
    const allowed = new Set([DICE_TYPES[roll[0]], DICE_TYPES[roll[1]]])
    const filtered = moves.filter(m => {
      if (m.action === 'drop') return false
      const piece = state.board[m.from]
      return piece && allowed.has(piece.type)
    })
    return filtered
  },
}

export const crazyhouse = {
  key: 'crazyhouse',
  drops: true,
}

function randomBackRank960(rng) {
  const pieces = Array(8).fill(null)
  const empty = () => pieces.map((p, i) => p === null ? i : -1).filter(i => i >= 0)
  const darkSqs = [0, 2, 4, 6], lightSqs = [1, 3, 5, 7]
  pieces[darkSqs[rng.nextInt(0, 3)]] = 'b'
  pieces[lightSqs[rng.nextInt(0, 3)]] = 'b'
  let e = empty(); pieces[e[rng.nextInt(0, e.length - 1)]] = 'q'
  e = empty(); pieces[e[rng.nextInt(0, e.length - 1)]] = 'n'
  e = empty(); pieces[e[rng.nextInt(0, e.length - 1)]] = 'n'
  e = empty()
  pieces[e[0]] = 'r'; pieces[e[1]] = 'k'; pieces[e[2]] = 'r'
  return pieces.join('')
}

export const chess960 = {
  key: 'chess960',
  setup(rng) {
    if (!rng) rng = createRng(960)
    const rank = randomBackRank960(rng)
    return rank + '/pppppppp/8/8/8/8/PPPPPPPP/' + rank.toUpperCase()
  },
}

function kingCaptureWin(state) {
  const board = state.board
  let whiteKing = false, blackKing = false
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || board[i].type !== 'king') continue
    if (board[i].owner === 0) whiteKing = true
    else blackKing = true
  }
  if (!whiteKing) return 'black'
  if (!blackKing) return 'white'
  return null
}

export const darkChess = {
  key: 'darkChess',
  noCheck: true,

  visibility(slice, viewerIndex, { allPositions, getCell }) {
    const knowledge = new Map()
    for (const pos of allPositions()) {
      const cell = getCell(slice.board, pos)
      if (cell && cell.owner === viewerIndex) {
        knowledge.set(pos, 'known')
      } else {
        knowledge.set(pos, 'unknown')
      }
    }
    return knowledge
  },

  winCondition: kingCaptureWin,
}

export const fogOfWar = {
  key: 'fogOfWar',
  noCheck: true,

  visibility(slice, viewerIndex, { topology, generateMovesForPiece, allPositions, getCell }) {
    const knowledge = new Map()
    for (const pos of allPositions()) {
      knowledge.set(pos, 'unknown')
    }
    for (const pos of allPositions()) {
      const cell = getCell(slice.board, pos)
      if (!cell || cell.owner !== viewerIndex) continue
      knowledge.set(pos, 'known')
      const moves = generateMovesForPiece(pos, slice, viewerIndex)
      for (const m of moves) {
        knowledge.set(m.to, 'known')
      }
    }
    return knowledge
  },

  winCondition: kingCaptureWin,
}

export const duckChess = {
  key: 'duckChess',
  noCheck: true,

  moveFilter(moves, state) {
    if (state._duckPhase) {
      const placements = []
      for (let i = 0; i < state.board.length; i++) {
        if (state.board[i] === null) {
          placements.push({ action: 'duck', to: i })
        }
      }
      return placements
    }
    const duckSq = state._duckSq
    if (duckSq !== undefined && duckSq >= 0) {
      return moves.filter(m => m.to !== duckSq)
    }
    return moves
  },

  turnLogic(ctx) {
    if (!ctx.slice._duckPhase) {
      ctx.slice._duckPhase = true
      return true
    }
    return false
  },

  winCondition: kingCaptureWin,
}
