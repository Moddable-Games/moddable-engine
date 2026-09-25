import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#173. Sankaku Shogi, from chessvariants.com/44.dir/sankaku-shogi.html
// (L. Lynn Smith, 2004). Every rule tested here is quoted from its source.
//
// The definition is written inline, as the variant's frontmatter carries it,
// so these hold whatever the corpus currently says about Sankaku.

const SHAPE = ['..AVA..', '.AVAVA.', 'AVAVAVA', 'VAVAVAV', 'AVAVAVA', 'VAVAVAV', '.VAVAV.', '..VAV..']

const PLUGIN = {
  setup: '2[cs][ep][cs]2/1[hn][hn][gj][hn][hn]1/1[sl][sl][sl][sl][sl]1/7/7/1[SL][SL][SL][SL][SL]1/1[HN][HN][GJ][HN][HN]1/2[CS][EP][CS]2',
  vocabulary: {
    emperor: { symbols: { 0: 'EP', 1: 'ep' } },
    chariot: { symbols: { 0: 'CS', 1: 'cs' } },
    cavalry: { symbols: { 0: 'HN', 1: 'hn' } },
    general: { symbols: { 0: 'GJ', 1: 'gj' } },
    soldier: { symbols: { 0: 'SL', 1: 'sl' } },
  },
  royalType: 'emperor',
  noCheck: true,
  drops: false,
  promotionZone: 0,
  pieceMoves: {
    emperor: { type: 'universal' },
    chariot: { type: 'rider', dirs: 'orthogonal', runDown: { types: ['soldier'] } },
    cavalry: { type: 'leaper', offsets: 'second-orthogonal', relay: true },
    general: { type: 'leaper', offsets: 'adjacent' },
    soldier: [
      { type: 'rider', dirs: 'orthogonal', maxSteps: 1 },
      { divergent: { capture: { type: 'rider', dirs: 'orthogonal', minSteps: 2, maxSteps: 2 } } },
    ],
  },
  promoteOnCapture: { soldier: 'general', cavalry: 'general' },
  captureImmunity: [
    { by: 'soldier', target: 'chariot' },
    { by: 'emperor', target: 'emperor', when: 'defended' },
  ],
}

function sankaku() {
  return createGameForFamily('shogi', {
    rngSeed: 1,
    definition: {
      title: 'Sankaku Shogi',
      slug: 'sankaku-shogi',
      parent: 'shogi',
      engine: {
        players: ['black', 'white'],
        topology: { type: 'triangular', cells: 44, shape: SHAPE },
        plugins: { shogi: PLUGIN },
      },
    },
  })
}

describe('sankaku shogi on a board of triangles', () => {
  let game
  beforeEach(() => { game = sankaku() })

  const state = () => game.getState()
  const topo = () => game.topology
  const targets = (from) => [...new Set(game.getLegalMoves().filter(m => m.from === from).map(m => m.to))].sort()
  const play = (from, to) => {
    const move = game.getLegalMoves().find(m => m.from === from && m.to === to)
    if (!move) throw new Error(`no legal move ${from}-${to}`)
    return game.applyMove(move)
  }

  function position(pieces, toMove = 0) {
    const board = {}
    for (const key of topo().getAllCells()) board[key] = null
    for (const [at, type, owner] of pieces) board[at] = { type, owner }
    game.loadState({ slice: { ...state().slice, board, hands: [[], []] }, players: { currentIndex: toMove } })
  }
  // The two Emperors, out of everyone's way, each guarded by nothing.
  const EMPERORS = [['a4', 'emperor', 0], ['g5', 'emperor', 1]]

  test('sets up thirteen a side where the source lists them', () => {
    const board = state().slice.board
    const at = (k) => board[k] && `${board[k].type}${board[k].owner}`
    expect(Object.values(board).filter(Boolean).length).toBe(26)
    expect(at('d1')).toBe('emperor0')
    expect(['c1', 'e1'].map(at)).toEqual(['chariot0', 'chariot0'])
    expect(['b2', 'c2', 'e2', 'f2'].map(at)).toEqual(['cavalry0', 'cavalry0', 'cavalry0', 'cavalry0'])
    expect(at('d2')).toBe('general0')
    expect(['b3', 'c3', 'd3', 'e3', 'f3'].every(k => at(k) === 'soldier0')).toBe(true)
    expect(at('d8')).toBe('emperor1')
    expect(['b6', 'c6', 'd6', 'e6', 'f6'].every(k => at(k) === 'soldier1')).toBe(true)
  })

  test('the Emperor "leaps to any cell on the playing field"', () => {
    position([...EMPERORS, ['d4', 'soldier', 1]])
    const to = targets('a4')
    expect(to.length).toBe(43)
    expect(to).toContain('d4')
  })

  test('"It may not capture an opponent Emperor which is defended"', () => {
    position([...EMPERORS, ['g4', 'general', 1]])
    expect(targets('a4')).not.toContain('g5')
    position(EMPERORS)
    expect(targets('a4')).toContain('g5')
  })

  test('the game is won by capturing the Emperor, and leaving it open is legal', () => {
    position(EMPERORS)
    // Not check: Black may move anything, and here does not move its Emperor.
    position([...EMPERORS, ['d1', 'general', 0]])
    expect(targets('d1').length).toBeGreaterThan(0)
    const result = play('a4', 'g5')
    expect(result.winner).toBe(0)
  })

  test('the Soldier "steps one orthogonal", through a side, any way', () => {
    position([...EMPERORS, ['d4', 'soldier', 0]])
    expect(targets('d4')).toEqual(topo().neighbours('d4').sort())
  })

  test('it "may capture to the second orthogonal if the first is vacant"', () => {
    const [first, second] = topo().rays('d4', 'orthogonal').find(r => r.length >= 2)
    position([...EMPERORS, ['d4', 'soldier', 0], [second, 'cavalry', 1]])
    expect(targets('d4')).toContain(second)
    // Not when the first cell is filled, and never as a plain move.
    position([...EMPERORS, ['d4', 'soldier', 0], [first, 'general', 0], [second, 'cavalry', 1]])
    expect(targets('d4')).not.toContain(second)
    position([...EMPERORS, ['d4', 'soldier', 0]])
    expect(targets('d4')).not.toContain(second)
  })

  test('it "cannot capture the Chariot", and "mandatorily promotes to General upon performing any capture"', () => {
    const [first] = topo().neighbours('d4')
    position([...EMPERORS, ['d4', 'soldier', 0], [first, 'chariot', 1]])
    expect(targets('d4')).not.toContain(first)
    position([...EMPERORS, ['d4', 'soldier', 0], [first, 'cavalry', 1]])
    play('d4', first)
    expect(state().slice.board[first]).toEqual({ type: 'general', owner: 0 })
  })

  test('the Chariot "slides orthogonal" along each strip until blocked', () => {
    position([...EMPERORS, ['d4', 'chariot', 0]])
    const expected = new Set(topo().rays('d4', 'orthogonal').flat().filter(k => k !== 'a4' && k !== 'g5'))
    for (const k of targets('d4')) expect(expected.has(k) || k === 'g5').toBe(true)
    expect(targets('d4')).toEqual(expect.arrayContaining(['e4', 'f4', 'g4', 'c4', 'b4']))
  })

  test('it "can run down an opponent Soldier, capturing it and continuing its slide"', () => {
    position([...EMPERORS, ['d4', 'chariot', 0], ['e4', 'soldier', 1]])
    const onward = game.getLegalMoves().filter(m => m.from === 'd4' && m.via === 'e4').map(m => m.to).sort()
    // d4 to e4 is the first step of two strips, along the rank and along a
    // slant, and the slide may carry on down either.
    const beyond = topo().rays('d4', 'orthogonal').filter(r => r[0] === 'e4').flatMap(r => r.slice(1))
    expect(onward).toEqual([...new Set(beyond)].sort())
    expect(onward).toEqual(expect.arrayContaining(['f4', 'g4']))
    game.applyMove(game.getLegalMoves().find(m => m.from === 'd4' && m.to === 'g4' && m.via === 'e4'))
    const board = state().slice.board
    expect(board.e4).toBeNull()
    expect(board.g4).toEqual({ type: 'chariot', owner: 0 })
  })

  test('one Soldier to a slide, which then ends on a vacant cell or its next capture', () => {
    position([...EMPERORS, ['d4', 'chariot', 0], ['e4', 'soldier', 1], ['f4', 'soldier', 1]])
    const alongRank = game.getLegalMoves().filter(m => m.from === 'd4' && m.via === 'e4' && ['f4', 'g4'].includes(m.to)).map(m => m.to)
    expect(alongRank).toEqual(['f4'])
  })

  test('a Chariot does not run down anything but a Soldier', () => {
    position([...EMPERORS, ['d4', 'chariot', 0], ['e4', 'general', 1]])
    expect(targets('d4')).not.toContain('f4')
  })

  test('the Cavalry "leaps to the second orthogonal"', () => {
    position([...EMPERORS, ['d4', 'cavalry', 0]])
    expect(targets('d4')).toEqual(topo().leapTargets('d4', 'second-orthogonal').sort())
  })

  test('from a friendly piece it "performs an additional leap in any direction without returning to its starting cell"', () => {
    const [via] = topo().leapTargets('d4', 'second-orthogonal')
    position([...EMPERORS, ['d4', 'cavalry', 0], [via, 'general', 0]])
    const onward = topo().leapTargets(via, 'second-orthogonal').filter(k => k !== 'd4' && k !== 'a4')
    expect(targets('d4')).toEqual(expect.arrayContaining(onward))
    expect(targets('d4')).not.toContain(via)
    expect(targets('d4')).not.toContain('d4')
  })

  test('and promotes to General when it captures', () => {
    const [to] = topo().leapTargets('d4', 'second-orthogonal')
    position([...EMPERORS, ['d4', 'cavalry', 0], [to, 'soldier', 1]])
    play('d4', to)
    expect(state().slice.board[to]).toEqual({ type: 'general', owner: 0 })
  })

  test('the General "steps to any cell which is adjacent, whether by side or point"', () => {
    position([...EMPERORS, ['d4', 'general', 0]])
    expect(targets('d4')).toEqual(topo().neighbours('d4', 'adjacent').filter(k => k !== 'a4').sort())
    expect(targets('d4').length).toBe(12)
  })

  test('"all captures are removed from play": nothing is ever dropped', () => {
    position([...EMPERORS, ['d4', 'general', 0], ['d5', 'soldier', 1]])
    play('d4', 'd5')
    game.loadState({ players: { currentIndex: 0 } })
    expect(game.getLegalMoves().some(m => m.action === 'drop')).toBe(false)
  })
})
