import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#179. Delirious Bughouse, from chessvariants.com/multiplayer.dir/
// delbug.html (Alberto Monteiro): Bughouse with two exceptions.
//
//   "Pawns may be placed only from the Second to the Sixth lines"
//   "Promoted Pawns are returned to the player that promoted the pawn, to be
//   inserted again. Captured promoted pawns do not return to pawn."
//
// Seats in the source's order - "White1, Black2, White3, Black4" - with
// White1 and Black4 allied.

const PLANE = 64
const sq = (name, board = 1) => (board === 2 ? PLANE : 0) + (8 - Number(name[1])) * 8 + name.charCodeAt(0) - 97
const rank = (i) => 8 - (((i % PLANE) / 8) | 0)

describe('delirious bughouse', () => {
  let game
  beforeEach(async () => { game = await createGameForFamily('chess', { variant: 'delirious-bughouse', rngSeed: 1 }) })
  const state = () => game.getState()

  function position(pieces, toMove, extra = {}) {
    const cells = new Array(2 * PLANE).fill(null)
    cells[sq('e1', 1)] = { type: 'king', owner: 0 }
    cells[sq('e8', 1)] = { type: 'king', owner: 1 }
    cells[sq('e1', 2)] = { type: 'king', owner: 2 }
    cells[sq('e8', 2)] = { type: 'king', owner: 3 }
    for (const [at, b, type, owner, more] of pieces) cells[sq(at, b)] = { type, owner, ...(more || {}) }
    const s = state()
    game.loadState({
      slice: { ...s.slice, board: cells, castlingRights: null, hands: [[], [], [], []], boardResults: {}, ...extra },
      players: { currentIndex: toMove },
    })
  }

  test('seats move round the table: White1, Black2, White3, Black4', () => {
    const order = []
    for (let i = 0; i < 8; i++) {
      order.push(state().players.currentIndex)
      game.applyMove(game.getLegalMoves()[0])
    }
    expect(order).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
  })

  test('a pawn is placed only on the 2nd to 6th ranks, counted from its own side', () => {
    position([], 0, { hands: [['pawn'], [], [], []] })
    const ranks = new Set(game.getLegalMoves().filter(m => m.action === 'drop').map(m => rank(m.to)))
    expect([...ranks].sort()).toEqual([2, 3, 4, 5, 6])

    // Black2 counts from the other edge: its 2nd to 6th are ranks 7 down to 3.
    position([], 1, { hands: [[], ['pawn'], [], []] })
    const black = new Set(game.getLegalMoves().filter(m => m.action === 'drop').map(m => rank(m.to)))
    expect([...black].sort()).toEqual([3, 4, 5, 6, 7])
  })

  test('the source example: a pawn taken on board 1 enters on board 2', () => {
    // "if White1 vs Black2 goes: 1-e4 d5 2-exd5 while White3 vs Black4 goes
    // 1-Nf3, then now Black4 can play 'Pawn enters into e5'."
    const play = (from, to) => game.applyMove(game.getLegalMoves().find(m => m.from === from && m.to === to))
    play(sq('e2', 1), sq('e4', 1))   // White1
    play(sq('d7', 1), sq('d5', 1))   // Black2
    play(sq('g1', 2), sq('f3', 2))   // White3
    play(sq('a7', 2), sq('a6', 2))   // Black4
    play(sq('e4', 1), sq('d5', 1))   // White1 takes: the pawn goes to Black4
    expect(state().slice.hands[3]).toEqual(['pawn'])
    play(sq('b8', 1), sq('c6', 1))   // Black2
    play(sq('b1', 2), sq('c3', 2))   // White3
    const enter = game.getLegalMoves().find(m => m.action === 'drop' && m.to === sq('e5', 2))
    expect(enter).toBeDefined()
  })

  test('a captured promoted piece stays promoted, and its promoter gets the pawn back', () => {
    // A queen White1 promoted, taken by Black2.
    position([['d4', 1, 'queen', 0, { wasPromoted: true }], ['d8', 1, 'rook', 1]], 1)
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('d8', 1) && m.to === sq('d4', 1)))
    const hands = state().slice.hands
    expect(hands[2]).toEqual(['queen'])   // Black2's ally, White3, gets a queen
    expect(hands[0]).toEqual(['pawn'])    // White1 gets its pawn back
  })

  test('the first checkmate decides the match', () => {
    // "if either of them is checkmated, the other loses"
    position([['a7', 1, 'rook', 0], ['b1', 1, 'rook', 0]], 0)
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('b1', 1) && m.to === sq('b8', 1)))
    expect(game.checkWin()).toEqual({ team: [0, 3], score: [1, 0] })
  })
})
