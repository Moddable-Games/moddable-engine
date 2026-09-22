import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// Found while building Tandem Chess (engine#179), which shares the drop rules.
// Crazyhouse carried its own copy of the drop action, and it had two faults the
// rulebook states against: "Pawns cannot be dropped on the first or eighth
// rank", and a drop is a move like any other, so it may not leave the dropper's
// King in check. A player in check could drop anywhere and ignore it.

const sq = (n) => (8 - Number(n[1])) * 8 + n.charCodeAt(0) - 97
const name = (i) => String.fromCharCode(97 + (i % 8)) + (8 - ((i / 8) | 0))

describe('crazyhouse drops', () => {
  let game
  beforeEach(async () => {
    game = await createGameForFamily('chess', { variant: 'crazyhouse', rngSeed: 1 })
    const cells = new Array(64).fill(null)
    cells[sq('e1')] = { type: 'king', owner: 0 }
    cells[sq('e8')] = { type: 'king', owner: 1 }
    const s = game.getState()
    game.loadState({ slice: { ...s.slice, board: cells, hands: [['pawn', 'knight'], []], castlingRights: null }, players: { currentIndex: 0 } })
  })
  const drops = () => game.getLegalMoves().filter(m => m.action === 'drop')

  test('a pawn is never dropped on the first or eighth rank', () => {
    const pawnRanks = new Set(drops().filter(m => m.type === 'pawn').map(m => name(m.to)[1]))
    expect(pawnRanks.has('1')).toBe(false)
    expect(pawnRanks.has('8')).toBe(false)
    expect(pawnRanks.size).toBe(6)
  })

  test('a player in check may only drop to block it', () => {
    const s = game.getState()
    const cells = s.slice.board.slice()
    cells[sq('e5')] = { type: 'rook', owner: 1 }
    game.loadState({ slice: { ...s.slice, board: cells } })
    expect(drops().map(m => `${m.type}@${name(m.to)}`).sort()).toEqual([
      'knight@e2', 'knight@e3', 'knight@e4', 'pawn@e2', 'pawn@e3', 'pawn@e4',
    ])
  })
})
