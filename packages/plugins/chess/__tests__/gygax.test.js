import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#159. Gygax Chess: three stacked 12x8 boards, sky, ground and
// underworld, with pieces that cross between them as ordinary moves.
//
// Every destination list below is transcribed from the movement diagrams on
// chessvariants.com/3d.dir/dragonchess.html (Jackman, edited Bodlaender), the
// source the rulebook cites. The source numbers the boards from the top, so
// "2c6" is the middle board, file c, rank 6.

const PLANE = 96
const sq = (name) => {
  const level = Number(name[0]) - 1
  const file = name.charCodeAt(1) - 97
  const rank = Number(name.slice(2))
  return level * PLANE + (8 - rank) * 12 + file
}
const name = (i) => {
  const level = (i / PLANE) | 0, local = i % PLANE
  return `${level + 1}${String.fromCharCode(97 + (local % 12))}${8 - ((local / 12) | 0)}`
}
const sorted = (list) => [...list].sort()

describe('gygax chess', () => {
  let game
  beforeEach(async () => { game = await createGameForFamily('chess', { variant: 'gygax', rngSeed: 1 }) })
  const board = () => game.getState().slice.board
  const movesFrom = (square) => game.getLegalMoves().filter(m => m.from === sq(square))
  const quiet = (square) => sorted(movesFrom(square).filter(m => !m.capture).map(m => name(m.to)))
  const takes = (square) => sorted(movesFrom(square).filter(m => m.capture).map(m => name(m.captured ?? m.to)))
  const reach = (square) => sorted(movesFrom(square).map(m => name(m.captured ?? m.to)))

  // Two kings on the back ranks of the middle board and whatever is given.
  function position(pieces, toMove = 0) {
    const cells = new Array(3 * PLANE).fill(null)
    cells[sq('2a1')] = { type: 'king', owner: 0 }
    cells[sq('2h8')] = { type: 'king', owner: 1 }
    for (const [at, type, owner] of pieces) cells[sq(at)] = { type, owner }
    const state = game.getState()
    game.loadState({ slice: { ...state.slice, board: cells }, players: { currentIndex: toMove } })
  }

  test('opens from the published array: Gold on ranks 1 and 2, Scarlet on 7 and 8', () => {
    // "the Gold Elemental (E) in opening setup starts at 3g1"
    expect(board()[sq('3g1')]).toMatchObject({ type: 'elemental', owner: 0 })
    expect(board()[sq('2g1')]).toMatchObject({ type: 'king', owner: 0 })
    expect(board()[sq('1g1')]).toMatchObject({ type: 'dragon', owner: 0 })
    expect(board()[sq('2g8')]).toMatchObject({ type: 'king', owner: 1 })
    expect(board()[sq('3b7')]).toMatchObject({ type: 'dwarf', owner: 1 })
    expect(board().filter(c => c && c.owner === 0)).toHaveLength(42)
    expect(board().filter(c => c && c.owner === 1)).toHaveLength(42)
  })

  test('Sylph: diagonal forward, captures ahead and straight down', () => {
    position([['1d5', 'sylph', 0], ['1d6', 'warrior', 1], ['2d5', 'warrior', 1]])
    expect(quiet('1d5')).toEqual(['1c6', '1e6'])
    expect(takes('1d5')).toEqual(['1d6', '2d5'])
  })

  test('Sylph below: only back up, to the cell above or an empty home cell', () => {
    position([['2j4', 'sylph', 0], ['1c2', 'warrior', 0]])
    // 1c2 is a home cell, but taken.
    expect(quiet('2j4')).toEqual(['1a2', '1e2', '1g2', '1i2', '1j4', '1k2'])
    expect(takes('2j4')).toEqual([])
  })

  test("Scarlet's Sylph dives to the board below, not across its own", () => {
    position([['1d5', 'sylph', 1], ['1d4', 'warrior', 0], ['2d5', 'warrior', 0]], 1)
    expect(quiet('1d5')).toEqual(['1c4', '1e4'])
    expect(takes('1d5')).toEqual(['1d4', '2d5'])
  })

  test('Griffin on the top board', () => {
    position([['1d5', 'griffon', 0]])
    expect(reach('1d5')).toEqual(sorted([
      '1b8', '1f8', '1a7', '1g7', '1a3', '1g3', '1b2', '1f2',
      '2c6', '2e6', '2c4', '2e4',
    ]))
  })

  test('Griffin on the middle board', () => {
    position([['2k2', 'griffon', 0]])
    expect(reach('2k2')).toEqual(sorted(['2j3', '2l3', '2j1', '2l1', '1j3', '1l3', '1j1', '1l1']))
  })

  test('Dragon captures from afar without moving, and never leaves the sky', () => {
    const afar = ['2f6', '2e5', '2f5', '2g5', '2f4']
    // Warriors as the victims: Thieves on 2e5 and 2f6 share a diagonal to
    // Gold's King, so taking one would uncover check from the other.
    position([['1f5', 'dragon', 0], ...afar.map(at => [at, 'warrior', 1])])
    const moves = movesFrom('1f5')
    expect(moves.every(m => name(m.to)[0] === '1')).toBe(true)
    const remote = moves.filter(m => m.to === m.from)
    expect(sorted(remote.map(m => name(m.captured)))).toEqual(sorted(afar))

    game.applyMove(remote.find(m => name(m.captured) === '2f5'))
    expect(board()[sq('1f5')]).toMatchObject({ type: 'dragon', owner: 0 })
    expect(board()[sq('2f5')]).toBeNull()
    expect(board().filter(c => c && c.type === 'warrior')).toHaveLength(4)
  })

  test('Hero on the middle board: one or two diagonally, jumping, or up and down', () => {
    position([['2c6', 'hero', 0], ['2d7', 'warrior', 0]])
    // The Warrior on 2d7 blocks only its own square; the Hero leaps it to 2e8.
    expect(reach('2c6')).toEqual(sorted([
      '2a8', '2e8', '2b7', '2b5', '2d5', '2a4', '2e4',
      '1b7', '1d7', '1b5', '1d5', '3b7', '3d7', '3b5', '3d5',
    ]))
  })

  test('Hero off the middle board can only return to it', () => {
    position([['3k2', 'hero', 0], ['1k7', 'hero', 0]])
    expect(reach('3k2')).toEqual(sorted(['2j3', '2l3', '2j1', '2l1']))
    expect(reach('1k7')).toEqual(sorted(['2j8', '2l8', '2j6', '2l6']))
  })

  test('Mage off the middle board goes two levels only through an empty middle', () => {
    position([['1e5', 'mage', 0]])
    expect(reach('1e5')).toEqual(sorted(['1e6', '1e4', '1d5', '1f5', '2e5', '3e5']))
    position([['1e5', 'mage', 0], ['2e5', 'warrior', 1]])
    expect(reach('1e5')).toEqual(sorted(['1e6', '1e4', '1d5', '1f5', '2e5']))
  })

  test('King off the middle board may only step back to it', () => {
    position([])
    const state = game.getState()
    const cells = state.slice.board.slice()
    cells[sq('2a1')] = null
    cells[sq('3d4')] = { type: 'king', owner: 0 }
    game.loadState({ slice: { ...state.slice, board: cells }, players: { currentIndex: 0 } })
    expect(reach('3d4')).toEqual(['2d4'])
  })

  test('Elemental rises only to capture, through an empty cell beside it', () => {
    position([['3e4', 'elemental', 0], ['2e5', 'thief', 1], ['2f4', 'thief', 1], ['3f4', 'warrior', 0]])
    // 2e5 is reached through 3e5, which is empty. 2f4 would pass 3f4, which is not.
    const up = movesFrom('3e4').filter(m => name(m.to)[0] === '2')
    expect(up.map(m => name(m.to))).toEqual(['2e5'])
    expect(up.every(m => m.capture)).toBe(true)
  })

  test('a Basilisk freezes the enemy piece above it, and only while it stays', () => {
    position([['2e5', 'oliphant', 0], ['3e5', 'basilisk', 1], ['3a8', 'dwarf', 1]])
    expect(movesFrom('2e5')).toHaveLength(0)
    game.loadState({ players: { currentIndex: 1 } })
    const away = game.getLegalMoves().find(m => m.from === sq('3e5') && m.to !== m.from)
    game.applyMove(away)
    expect(movesFrom('2e5').length).toBeGreaterThan(0)
  })

  test('a frozen piece gives no check', () => {
    // Scarlet's Oliphant on 2a5 looks down the a-file at Gold's King on 2a1.
    position([['2a5', 'oliphant', 1], ['2k4', 'thief', 0]])
    expect(movesFrom('2k4')).toHaveLength(0)            // in check: only the King may answer
    position([['2a5', 'oliphant', 1], ['2k4', 'thief', 0], ['3a5', 'basilisk', 0]])
    expect(movesFrom('2k4').length).toBeGreaterThan(0)  // frozen, so no check at all
  })

  test('a capture from afar is judged with the Dragon still in place', () => {
    // Gold's Dragon on 1b2 stands between Gold's King on 1a1 and Scarlet's
    // Dragon on 1d4. Taking the Warrior on 2b3 from afar leaves it there, so
    // the King stays covered. Simulated as a move, the Dragon left its square
    // and the capture was rejected for exposing the King.
    position([['1b2', 'dragon', 0], ['1d4', 'dragon', 1], ['2b3', 'warrior', 1]])
    const state = game.getState()
    const cells = state.slice.board.slice()
    cells[sq('2a1')] = null
    cells[sq('1a1')] = { type: 'king', owner: 0 }
    game.loadState({ slice: { ...state.slice, board: cells }, players: { currentIndex: 0 } })
    expect(movesFrom('1b2').some(m => m.to === m.from && name(m.captured) === '2b3')).toBe(true)
  })

  test('a Warrior promotes to a Hero only', () => {
    position([['2c7', 'warrior', 0]])
    const push = movesFrom('2c7').filter(m => name(m.to) === '2c8')
    expect(push.map(m => m.promotion)).toEqual(['hero'])
  })

  test('it keeps playing across all three boards', () => {
    let plies = 0
    for (; plies < 80; plies++) {
      const moves = game.getLegalMoves()
      if (!moves.length || game.checkWin()) break
      game.applyMove(moves[(plies * 11) % moves.length])
    }
    expect(plies).toBeGreaterThan(30)
    expect(board().filter(Boolean).length).toBeGreaterThan(40)
  })
})
