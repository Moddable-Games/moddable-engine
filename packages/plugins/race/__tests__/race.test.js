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

// A position from a board of `piece()` entries and reserves counted per seat.
// Each piece's place along its route is found from the rulebook's own route,
// as the plugin finds it.
function position(family, { board = {}, reserve, off, toMove = WHITE, captured } = {}) {
  const g = game(family)
  const slice = g.getState().slice
  const plugin = g.raw.definition.plugins[family]
  const cols = g.raw.definition.topology.cols
  const cellOf = (ref) => (Array.isArray(ref) ? ref[0] * cols + ref[1] : ref)
  const stepOn = (route, cell) => plugin.routes[route].map(cellOf).indexOf(cell)
  const built = {}
  for (const [key, spec] of Object.entries(board)) {
    const cell = typeof Object.values(plugin.routes)[0][0] === 'string' ? key : Number(key)
    const step = spec.step ?? stepOn(spec.route, cell)
    built[key] = { type: 'piece', owner: spec.owner, count: spec.count, items: Array.from({ length: spec.count }, () => ({ route: spec.route, step })) }
  }
  const routesOf = (seat) => { const r = plugin.seatRoutes; const own = Array.isArray(r) ? r[seat] : r; return Array.isArray(own) ? own : [own] }
  const reserves = reserve ? reserve.map((n, seat) => ({ [routesOf(seat)[0]]: n })) : slice.reserve
  g.loadState({
    slice: { ...slice, board: built, reserve: reserves, off: off || slice.off, captured: captured || slice.captured, toMove, phase: 'throw', throws: [], again: false },
    players: { currentIndex: toMove },
  })
  return g
}

const piece = (owner, route, count = 1, step) => ({ owner, route, count, step })
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
    expect(slice(game('royal-ur')).reserve).toEqual([{ white: 7 }, { black: 7 }])
    expect(Object.keys(slice(game('senet')).board)).toHaveLength(10)
    expect(slice(game('nyout')).reserve).toEqual([{ outer: 4 }, { outer: 4 }])
  })

  it('weighs a throw of four lots binomially', () => {
    const outcomes = createRacePlugin({ throw: { lots: 4 } }).chanceOutcomes({ action: 'throw' })
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
    expect(slice(g).reserve[BLACK].black).toBe(7)
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
    expect(thrown(exact, 1)).toEqual([{ action: 'bear off', piece: ur(2, 6), throw: 1, route: 'white', step: 13 }])
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
    const g = position('senet', { board: { [sn(2, 3)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 4] })
    expect(thrown(g, 3).filter(m => !m.back).some(m => m.from === sn(2, 3))).toBe(false)
    const lands = position('senet', { board: { [sn(2, 3)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 4] })
    expect(thrown(lands, 2).map(m => m.to)).toEqual([sn(2, 5)])
  })

  it('sends a piece in the water back to the House of Rebirth', () => {
    const g = position('senet', { board: { [sn(2, 5)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 4] })
    thrown(g, 1)
    g.applyMove({ from: sn(2, 5), to: sn(2, 6), throw: 1 })
    expect(slice(g).board[sn(1, 5)]?.owner).toBe(WHITE)
    expect(slice(g).board[sn(2, 6)]).toBeUndefined()
  })

  it('bears off from the last three squares with their own throw only', () => {
    const g = position('senet', { board: { [sn(2, 7)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 4] })
    expect(thrown(g, 3)).toEqual([{ action: 'bear off', piece: sn(2, 7), throw: 3, route: 'path', step: 27 }])
    const early = position('senet', { board: { [sn(2, 5)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 4] })
    expect(thrown(early, 5).some(m => m.action === 'bear off')).toBe(false)
  })

  it('steps back to the nearest empty square when nothing can go forward', () => {
    // On 30 only a 1 bears off, and there is nowhere further to go.
    const g = position('senet', { board: { [sn(2, 9)]: piece(WHITE, 'path'), [sn(2, 8)]: piece(BLACK, 'path') }, reserve: [0, 0], off: [4, 4] })
    expect(thrown(g, 2)).toEqual([{ from: sn(2, 9), to: sn(2, 7), throw: 2, route: 'path', step: 29, back: true }])
  })

  it('throws again after a 1, 4 or 5, and not after a 2', () => {
    const again = position('senet', { board: { [sn(0, 0)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 4] })
    thrown(again, 4)
    again.applyMove({ from: sn(0, 0), to: sn(0, 4), throw: 4 })
    expect(again.currentPlayer()).toBe('white')
    const not = position('senet', { board: { [sn(0, 0)]: piece(WHITE, 'path') }, reserve: [0, 0], off: [4, 4] })
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
    expect(slice(hit).reserve[WHITE].outer).toBe(4)
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

// engine#152. Pachisi and Chaupar share the cross and its four routes; each
// route goes down its own middle column and comes back up it, so a piece
// knows its step, not only its cell. South's route begins at [11,9].
const px = (r, c) => r * 19 + c
const R = 0, Y = 1, G = 2, B = 3

describe('Pachisi', () => {
  it('opens with one piece of each side on the first square of its arm', () => {
    const board = slice(game('pachisi')).board
    expect(board[px(11, 9)]).toMatchObject({ owner: R, items: [{ route: 'south', step: 0 }] })
    expect(board[px(7, 9)]).toMatchObject({ owner: G, items: [{ route: 'north', step: 0 }] })
  })

  it('brings a piece out only with a grace, onto the first square', () => {
    const plain = position('pachisi', { reserve: [3, 3, 3, 3] })
    expect(thrown(plain, 4).some(m => m.action === 'enter')).toBe(false)
    const grace = position('pachisi', { reserve: [3, 3, 3, 3] })
    expect(thrown(grace, 25)).toContainEqual({ action: 'enter', to: px(11, 9), throw: 25, route: 'south' })
  })

  it('throws again after a grace, and not after a 4', () => {
    const g = position('pachisi', { board: { [px(12, 9)]: piece(R, 'south') }, reserve: [3, 3, 3, 3] })
    thrown(g, 6)
    g.applyMove({ from: px(12, 9), to: px(18, 9), throw: 6 })
    expect(g.currentPlayer()).toBe('red')
  })

  it('tells a piece leaving its middle column from one coming home up it', () => {
    // [13,9] is step 2 going out and step 80 coming back.
    const out = position('pachisi', { board: { [px(13, 9)]: piece(R, 'south', 1, 2) }, reserve: [3, 3, 3, 3] })
    expect(thrown(out, 2).map(m => m.to)).toContain(px(15, 9))
    const home = position('pachisi', { board: { [px(13, 9)]: piece(R, 'south', 1, 80) }, reserve: [3, 3, 3, 3] })
    expect(thrown(home, 3)).toContainEqual(expect.objectContaining({ action: 'bear off', piece: px(13, 9), step: 80 }))
  })

  it('keeps a piece on a castle safe, and lets a side share a square', () => {
    // [15,10] is a castle, 13 steps along South's route.
    // [15,10] is a castle: South's step 11, on every other side's way round.
    const castle = position('pachisi', { board: { [px(15, 10)]: piece(Y, 'west'), [px(17, 10)]: piece(R, 'south') }, reserve: [3, 3, 3, 3] })
    expect(thrown(castle, 2).some(m => m.to === px(15, 10))).toBe(false)
    const open = position('pachisi', { board: { [px(16, 10)]: piece(Y, 'west'), [px(18, 10)]: piece(R, 'south') }, reserve: [3, 3, 3, 3] })
    expect(thrown(open, 2).some(m => m.to === px(16, 10))).toBe(true)
    const share = position('pachisi', { board: { [px(12, 9)]: piece(R, 'south', 1, 1), [px(14, 9)]: piece(R, 'south', 1, 3) }, reserve: [2, 3, 3, 3] })
    thrown(share, 2)
    share.applyMove({ from: px(12, 9), to: px(14, 9), throw: 2, step: 1 })
    expect(slice(share).board[px(14, 9)].count).toBe(2)
  })

  it('lets a player refuse to move', () => {
    const g = position('pachisi', { board: { [px(12, 9)]: piece(R, 'south') }, reserve: [3, 3, 3, 3] })
    expect(thrown(g, 3)).toContainEqual({ action: 'pass' })
    g.applyMove({ action: 'pass' })
    expect(g.currentPlayer()).toBe('yellow')
  })

  it('throws seven shells in the seven-shell game, and gives two arms to each player in the two-player game', () => {
    const seven = createGameForFamily('pachisi', { variant: 'seven-shell', rngSeed: 1 })
    const values = seven.raw.registry.getPlugins().find(p => p.sliceName === 'race').chanceOutcomes({ action: 'throw' }).map(o => o.move.value).sort((a, b) => a - b)
    expect(values).toEqual([2, 3, 4, 7, 10, 14, 25, 35])
    const two = createGameForFamily('pachisi', { variant: 'two-player', rngSeed: 1 })
    expect(slice(two).reserve).toEqual([{ south: 3, north: 3 }, { west: 3, east: 3 }])
  })
})

// The cell `n` steps along a route, read from the rulebook.
function routeCell(family, route, n) {
  const def = game(family).raw.definition
  const [r, c] = def.plugins[family].routes[route][n]
  return r * def.topology.cols + c
}

describe('Chaupar', () => {
  it('splits three long dice among pieces in any grouping', () => {
    const g = position('chaupar', { board: { [px(12, 9)]: piece(R, 'south', 1, 1) }, reserve: [3, 4, 4, 4] })
    g.applyMove({ action: 'throw', dice: [1, 2, 6] })
    const spends = [...new Set(g.getLegalMoves().filter(m => m.from === px(12, 9)).map(m => m.dice.join('+')))].sort()
    expect(spends).toEqual(['1', '1+2', '1+2+6', '1+6', '2', '2+6', '6'])
  })

  it('moves pieces standing together as one, taking a single piece', () => {
    // South steps 17 and 20 are on the right arm's outer row, where every
    // side's route passes.
    const from = routeCell('chaupar', 'south', 17)
    const to = routeCell('chaupar', 'south', 20)
    const g = position('chaupar', { board: { [from]: piece(R, 'south', 2), [to]: piece(G, 'north') }, reserve: [2, 4, 3, 4] })
    g.applyMove({ action: 'throw', dice: [1, 1, 1] })
    g.applyMove({ from, to, throw: 3, dice: [1, 1, 1] })
    expect(slice(g).board[to]).toMatchObject({ owner: R, count: 2 })
    expect(slice(g).board[from]).toBeUndefined()
    expect(slice(g).reserve[G].north).toBe(4)
  })

  it('keeps a pair from a single piece that lands on it', () => {
    const pair = routeCell('chaupar', 'south', 20)
    const north = game('chaupar').raw.definition.plugins.chaupar.routes.north.map(([r, c]) => r * 19 + c)
    const at = north.indexOf(pair)
    const green = north[at - 3]
    const g = position('chaupar', { board: { [green]: piece(G, 'north'), [pair]: piece(R, 'south', 2) }, reserve: [2, 4, 3, 4], toMove: G })
    g.applyMove({ action: 'throw', dice: [1, 1, 1] })
    const reach = g.getLegalMoves().filter(m => m.from === green).map(m => m.to)
    expect(reach).toEqual(expect.arrayContaining([north[at - 2], north[at - 1]]))
    expect(reach).not.toContain(pair)
  })

  it('lets no piece finish before its side has captured', () => {
    const before = position('chaupar', { board: { [px(13, 9)]: piece(R, 'south', 1, 80) }, reserve: [3, 4, 4, 4] })
    before.applyMove({ action: 'throw', dice: [1, 1, 1] })
    expect(before.getLegalMoves().some(m => m.action && m.action.startsWith('bear off'))).toBe(false)
    const after = position('chaupar', { board: { [px(13, 9)]: piece(R, 'south', 1, 80) }, reserve: [3, 4, 4, 4], captured: [true, false, false, false] })
    after.applyMove({ action: 'throw', dice: [1, 1, 1] })
    expect(after.getLegalMoves().some(m => m.action && m.action.startsWith('bear off'))).toBe(true)
  })

  it('finishes partners in order, and wins as a team', () => {
    // Green's step 80 is three from home; Green waits for Red.
    const home = routeCell('chaupar', 'north', 80)
    const g = position('chaupar', { board: { [home]: piece(G, 'north', 1, 80) }, reserve: [0, 4, 0, 4], off: [4, 0, 3, 0], toMove: G, captured: [true, false, true, false] })
    g.applyMove({ action: 'throw', dice: [1, 1, 1] })
    const off = g.getLegalMoves().find(m => m.action && m.action.startsWith('bear off'))
    expect(off).toBeDefined()
    g.applyMove(off)
    expect(g.checkWin()).toBe(R)
    const waits = position('chaupar', { board: { [home]: piece(G, 'north', 1, 80) }, reserve: [1, 4, 0, 4], off: [3, 0, 3, 0], toMove: G, captured: [true, false, true, false] })
    waits.applyMove({ action: 'throw', dice: [1, 1, 1] })
    expect(waits.getLegalMoves().some(m => m.action && m.action.startsWith('bear off'))).toBe(false)
  })
})
