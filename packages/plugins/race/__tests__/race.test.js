import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, getPlugin } from '../../../play/src/play.js'
import { createRacePlugin } from '../index.js'

// engine#151. The Royal Game of Ur, Senet and Nyout are one race plugin, each
// declaring its routes, throw and landing rules in its rulebook. Positions
// are built by hand so each test sees only the rule it is about; a throw that
// names its value is played as that throw.

const WHITE = 0
const BLACK = 1

function game(family, seed = 1) {
  return createGameForFamily(family, { variant: 'standard', rngSeed: seed })
}

function position(family, { board = {}, reserve, off, toMove = WHITE } = {}) {
  const g = game(family)
  const slice = g.getState().slice
  g.loadState({
    slice: { ...slice, board, reserve: reserve || slice.reserve, off: off || slice.off, toMove, phase: 'throw', throws: [], again: false },
    players: { currentIndex: toMove },
  })
  return g
}

const piece = (owner, route, count = 1) => ({ type: 'piece', owner, count, route })
const thrown = (g, value) => { g.applyMove({ action: 'throw', value }); return g.getLegalMoves() }
const slice = (g) => g.getState().slice

// Ur's grid is 3 x 8; Senet's 3 x 10.
const ur = (r, c) => r * 8 + c
const sn = (r, c) => r * 10 + c

describe('the race games are played by one plugin their rulebooks name', () => {
  it.each(['royal-ur', 'senet', 'nyout'])('%s', (family) => {
    expect(getPlugin(family)?.factory).toBe(createRacePlugin)
  })

  it('opens each game as its rulebook sets it', () => {
    expect(slice(game('royal-ur')).reserve).toEqual([7, 7])
    expect(Object.keys(slice(game('senet')).board)).toHaveLength(10)
    expect(slice(game('nyout')).reserve).toEqual([4, 4])
  })

  it('weighs a throw of four lots binomially', () => {
    const outcomes = getPlugin('royal-ur').factory({ throw: { lots: 4 } }).chanceOutcomes({ action: 'throw' })
    expect(outcomes.map(o => [o.move.value, o.probability])).toEqual([[0, 1 / 16], [1, 4 / 16], [2, 6 / 16], [3, 4 / 16], [4, 1 / 16]])
  })
})

describe('the Royal Game of Ur', () => {
  it('enters a piece along its own lane and passes on a throw of 0', () => {
    const g = game('royal-ur')
    expect(thrown(g, 2)).toEqual([{ action: 'enter', to: ur(2, 2), throw: 2, route: 'white' }])
    const zero = game('royal-ur')
    thrown(zero, 0)
    expect(zero.currentPlayer()).toBe('black')
  })

  it('sends a piece landed on in the shared lane back to reserve', () => {
    const g = position('royal-ur', { board: { [ur(1, 1)]: piece(WHITE, 'white'), [ur(1, 2)]: piece(BLACK, 'black') }, reserve: [6, 6] })
    thrown(g, 1)
    g.applyMove({ from: ur(1, 1), to: ur(1, 2), throw: 1 })
    expect(slice(g).reserve[BLACK]).toBe(7)
  })

  it('gives another throw on a rosette, and makes it safe', () => {
    const g = position('royal-ur', { board: { [ur(1, 2)]: piece(WHITE, 'white') }, reserve: [6, 7] })
    thrown(g, 1)
    g.applyMove({ from: ur(1, 2), to: ur(1, 3), throw: 1 })
    expect(g.currentPlayer()).toBe('white')
    const safe = position('royal-ur', { board: { [ur(1, 3)]: piece(BLACK, 'black'), [ur(1, 1)]: piece(WHITE, 'white') }, reserve: [6, 6] })
    expect(thrown(safe, 2).some(m => m.to === ur(1, 3))).toBe(false)
  })

  it('bears off only with the exact throw', () => {
    const over = position('royal-ur', { board: { [ur(2, 6)]: piece(WHITE, 'white') }, reserve: [0, 7], off: [6, 0] })
    expect(thrown(over, 2).some(m => m.action === 'bear off')).toBe(false)
    const exact = position('royal-ur', { board: { [ur(2, 6)]: piece(WHITE, 'white') }, reserve: [0, 7], off: [6, 0] })
    expect(thrown(exact, 1)).toEqual([{ action: 'bear off', piece: ur(2, 6), throw: 1, route: 'white' }])
    exact.applyMove({ action: 'bear off', piece: ur(2, 6), throw: 1 })
    expect(exact.checkWin()).toBe(WHITE)
  })
})

describe('Senet', () => {
  it('swaps with a lone piece it lands on', () => {
    const g = position('senet', { board: { [sn(0, 0)]: piece(WHITE, 'path'), [sn(0, 2)]: piece(BLACK, 'path') }, reserve: [0, 0], off: [4, 4] })
    thrown(g, 2)
    g.applyMove({ from: sn(0, 0), to: sn(0, 2), throw: 2 })
    expect(slice(g).board[sn(0, 0)].owner).toBe(BLACK)
    expect(slice(g).board[sn(0, 2)].owner).toBe(WHITE)
  })

  it('cannot land on a pair, nor pass three in a row', () => {
    const pair = position('senet', { board: { [sn(0, 0)]: piece(WHITE, 'path'), [sn(0, 2)]: piece(BLACK, 'path'), [sn(0, 3)]: piece(BLACK, 'path') }, reserve: [0, 0], off: [4, 3] })
    expect(thrown(pair, 2).some(m => m.to === sn(0, 2))).toBe(false)
    const wall = position('senet', { board: { [sn(0, 0)]: piece(WHITE, 'path'), [sn(0, 1)]: piece(BLACK, 'path'), [sn(0, 2)]: piece(BLACK, 'path'), [sn(0, 3)]: piece(BLACK, 'path') }, reserve: [0, 0], off: [4, 2] })
    expect(thrown(wall, 5).some(m => m.from === sn(0, 0))).toBe(false)
  })

  it('stops every piece on the House of Happiness', () => {
    const g = position('senet', { board: { [sn(2, 3)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 5] })
    expect(thrown(g, 3).filter(m => !m.back).some(m => m.from === sn(2, 3))).toBe(false)
    const lands = position('senet', { board: { [sn(2, 3)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 5] })
    expect(thrown(lands, 2).map(m => m.to)).toEqual([sn(2, 5)])
  })

  it('sends a piece in the water back to the House of Rebirth', () => {
    const g = position('senet', { board: { [sn(2, 5)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 5] })
    thrown(g, 1)
    g.applyMove({ from: sn(2, 5), to: sn(2, 6), throw: 1 })
    expect(slice(g).board[sn(1, 5)]?.owner).toBe(WHITE)
    expect(slice(g).board[sn(2, 6)]).toBeUndefined()
  })

  it('bears off from the last three squares with their own throw only', () => {
    const g = position('senet', { board: { [sn(2, 7)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 5] })
    expect(thrown(g, 3)).toEqual([{ action: 'bear off', piece: sn(2, 7), throw: 3, route: 'path' }])
    const early = position('senet', { board: { [sn(2, 5)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 5] })
    expect(thrown(early, 5).some(m => m.action === 'bear off')).toBe(false)
  })

  it('steps back to the nearest empty square when nothing can go forward', () => {
    // On 30 only a 1 bears off, and there is nowhere further to go.
    const g = position('senet', { board: { [sn(2, 9)]: piece(WHITE, 'path'), [sn(2, 8)]: piece(BLACK, 'path') }, reserve: [0, 0], off: [4, 4] })
    expect(thrown(g, 2)).toEqual([{ from: sn(2, 9), to: sn(2, 7), throw: 2, route: 'path', back: true }])
  })

  it('throws again after a 1, 4 or 5, and not after a 2', () => {
    const again = position('senet', { board: { [sn(0, 0)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 5] })
    thrown(again, 4)
    again.applyMove({ from: sn(0, 0), to: sn(0, 4), throw: 4 })
    expect(again.currentPlayer()).toBe('white')
    const not = position('senet', { board: { [sn(0, 0)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 5] })
    thrown(not, 2)
    not.applyMove({ from: sn(0, 0), to: sn(0, 2), throw: 2 })
    expect(not.currentPlayer()).toBe('black')
  })
})

describe('Nyout', () => {
  it('offers the shortcut from a corner it stands on, and the long way', () => {
    const g = position('nyout', { board: { n6: piece(WHITE, 'outer') }, reserve: [3, 4] })
    const moves = thrown(g, 2).filter(m => m.from === 'n6')
    expect(moves.map(m => `${m.to}/${m.route}`).sort()).toEqual(['n28/first', 'n8/outer'])
  })

  it('keeps a piece passing a corner on the outside', () => {
    const g = position('nyout', { board: { n5: piece(WHITE, 'outer') }, reserve: [3, 4] })
    expect(thrown(g, 3).filter(m => m.from === 'n5').map(m => m.to)).toEqual(['n8'])
  })

  it('goes home the short way from the centre', () => {
    const g = position('nyout', { board: { n21: piece(WHITE, 'first') }, reserve: [3, 4] })
    const moves = thrown(g, 3).filter(m => m.from === 'n21' || m.piece === 'n21')
    expect(moves.some(m => m.action && m.action.startsWith('bear off') && m.route === 'centre')).toBe(true)
    expect(moves.some(m => m.to === 'n16' && m.route === 'first')).toBe(true)
  })

  it('banks a Yut and plays both throws afterwards', () => {
    const g = position('nyout', { reserve: [4, 4] })
    g.applyMove({ action: 'throw', value: 4 })
    expect(slice(g).phase).toBe('throw')
    g.applyMove({ action: 'throw', value: 2 })
    expect(slice(g).throws).toEqual([4, 2])
  })

  it('stacks tokens into a horse, and a capture sends the whole horse home and throws again', () => {
    const g = position('nyout', { board: { n3: piece(WHITE, 'outer'), n4: piece(WHITE, 'outer') }, reserve: [2, 3] })
    thrown(g, 1)
    g.applyMove({ from: 'n3', to: 'n4', throw: 1 })
    expect(slice(g).board.n4.count).toBe(2)
    const hit = position('nyout', { board: { n4: piece(WHITE, 'outer', 2), n2: piece(BLACK, 'outer') }, reserve: [2, 3], toMove: BLACK })
    thrown(hit, 2)
    hit.applyMove({ from: 'n2', to: 'n4', throw: 2 })
    expect(slice(hit).reserve[WHITE]).toBe(4)
    expect(hit.currentPlayer()).toBe('black')
  })
})

// The controller looked for the board under family names only, and a race
// game's slice is `race`, which is no family's name: every piece was
// invisible to a click, so nothing could be selected or moved.
describe('a race game answers clicks', () => {
  it('selects a piece and moves it with two clicks', async () => {
    const { createGameController } = await import('../../../play/src/game-controller.js')
    const g = game('senet')
    g.applyMove({ action: 'throw', value: 2 })
    const names = g.getState().players?.names || ['white', 'black']
    const ctrl = createGameController(g.raw, { family: 'senet', players: Object.fromEntries(names.map(n => [n, 'human'])) })
    const move = g.getLegalMoves()[0]
    ctrl.handleClick(move.from)
    expect(ctrl.getState().selected).toBe(move.from)
    ctrl.handleClick(move.to)
    expect(slice(g).board[move.to]?.owner).toBe(WHITE)
  })
})
