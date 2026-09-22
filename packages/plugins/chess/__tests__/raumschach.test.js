import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createGridTopology } from '../../../topologies/grid/index.js'

// engine#159. Raumschach is five stacked 5x5 levels, and unlike Alice's two
// boards the stack IS the board: a Rook slides up a column exactly as it slides
// along a file. The grid says which kind of stack it is with
// `layerAdjacency: stacked`, and a direction gains a third component for the
// level.
//
// Every destination list below is transcribed from the worked examples on
// chessvariants.com/3d.dir/3d5.html, the source this variant's rulebook cites.

const PLANE = 25
const LEVELS = 'ABCDE'
// "Bc3" is level B, file c, rank 3. Level A is plane 0 and rank 5 is row 0.
const sq = (name) => {
  const level = LEVELS.indexOf(name[0])
  const file = name.charCodeAt(1) - 97
  const rank = Number(name[2])
  return level * PLANE + (5 - rank) * 5 + file
}
const name = (i) => {
  const level = (i / PLANE) | 0, local = i % PLANE
  return LEVELS[level] + String.fromCharCode(97 + (local % 5)) + (5 - ((local / 5) | 0))
}
const sorted = (cells) => cells.map(name).sort()

describe('a stacked board is one volume', () => {
  const topo = createGridTopology({ rows: 5, cols: 5, layers: 5, layerAdjacency: 'stacked' })
  const reach = (from, dirs) => sorted(topo.rays(sq(from), dirs).flat())

  test('the named directions are those of a volume', () => {
    expect(topo.getDirections('orthogonal')).toHaveLength(6)
    expect(topo.getDirections('diagonal')).toHaveLength(12)
    expect(topo.getDirections('triagonal')).toHaveLength(8)
    expect(topo.getDirections('all')).toHaveLength(26)
    expect(topo.getDirections('knight')).toHaveLength(24)
  })

  test('the Rook slides along a file, a rank and a column', () => {
    // "A Rook positioned at Cc3 can move to: Ccx, Cx3, Xc3"
    expect(reach('Cc3', 'orthogonal')).toEqual([
      'Ac3', 'Bc3', 'Ca3', 'Cb3', 'Cc1', 'Cc2', 'Cc4', 'Cc5', 'Cd3', 'Ce3', 'Dc3', 'Ec3',
    ])
  })

  test('the Bishop crosses the edges of a cell, in three planes', () => {
    // "A bishop positioned at Dc4 on an empty board can move to: Da2, Db3,
    // Dd5, De2, Dd3, Db5 ... Eb4, Ed4, Cb4, cd4, Ba4, Be4 ... Ec3, Ec5, Cc3,
    // Cc5, Bc2, Ac1"
    expect(reach('Dc4', 'diagonal')).toEqual([
      'Da2', 'Db3', 'Dd5', 'De2', 'Dd3', 'Db5',
      'Eb4', 'Ed4', 'Cb4', 'Cd4', 'Ba4', 'Be4',
      'Ec3', 'Ec5', 'Cc3', 'Cc5', 'Bc2', 'Ac1',
    ].sort())
  })

  test('the Unicorn crosses the corners', () => {
    // "A Unicorn placed at Cc3 on an empty board can move to Dd4, Ee5, Bb2,
    // Aa1, Db2, Ea1, Bd4, Ae5, Ee1, Dd2, Bb4, Aa5, Ea5, Db4, Bd2 and Ae1."
    expect(reach('Cc3', 'triagonal')).toEqual([
      'Dd4', 'Ee5', 'Bb2', 'Aa1', 'Db2', 'Ea1', 'Bd4', 'Ae5',
      'Ee1', 'Dd2', 'Bb4', 'Aa5', 'Ea5', 'Db4', 'Bd2', 'Ae1',
    ].sort())
  })

  test('the Knight reaches Ac3 from Aa1 in two moves', () => {
    // "A 3-D Knight requires only two: Aa1 - Bc1 - Ac3."
    const first = topo.leapTargets(sq('Aa1'), 'knight')
    expect(first.map(name)).toContain('Bc1')
    expect(topo.leapTargets(sq('Bc1'), 'knight').map(name)).toContain('Ac3')
  })

  test('a level step goes nowhere on a board whose planes do not touch', () => {
    // Alice's boards are separate, and must stay so.
    const alice = createGridTopology({ rows: 8, cols: 8, layers: 2 })
    expect(alice.getDirections('all')).toHaveLength(8)
    expect(alice.step(0, [0, 0, 1])).toBeNull()
    expect(alice.rays(0, [[0, 0, 1]]).flat()).toEqual([])
    expect(alice.leapTargets(0, [[1, 2, 1]])).toEqual([])
  })

  test('the stack has a floor and a ceiling', () => {
    expect(topo.step(sq('Ec3'), [0, 0, 1])).toBeNull()
    expect(topo.step(sq('Ac3'), [0, 0, -1])).toBeNull()
    expect(name(topo.step(sq('Ac3'), [0, 0, 1]))).toBe('Bc3')
  })
})

describe('raumschach', () => {
  let game
  beforeEach(async () => { game = await createGameForFamily('chess', { variant: 'raumschach', rngSeed: 1 }) })
  const board = () => game.getState().slice.board
  const movesFrom = (square) => game.getLegalMoves().filter(m => m.from === sq(square))

  // An otherwise empty volume holding the two kings and whatever is given.
  function position(pieces) {
    const cells = new Array(5 * PLANE).fill(null)
    cells[sq('Aa1')] = { type: 'king', owner: 0 }
    cells[sq('Ee5')] = { type: 'king', owner: 1 }
    for (const [at, type, owner] of pieces) cells[sq(at)] = { type, owner }
    const state = game.getState()
    game.loadState({ slice: { ...state.slice, board: cells }, players: { currentIndex: 0 } })
  }

  test('starts from the published array, twenty pieces a side', () => {
    expect(board()).toHaveLength(125)
    expect(board()[sq('Ac1')]).toMatchObject({ type: 'king', owner: 0 })
    expect(board()[sq('Bc1')]).toMatchObject({ type: 'queen', owner: 0 })
    expect(board()[sq('Bb1')]).toMatchObject({ type: 'unicorn', owner: 0 })
    expect(board()[sq('Dc5')]).toMatchObject({ type: 'queen', owner: 1 })
    expect(board()[sq('Ec5')]).toMatchObject({ type: 'king', owner: 1 })
    expect(board().filter(c => c && c.owner === 0)).toHaveLength(20)
    expect(board().filter(c => c && c.owner === 1)).toHaveLength(20)
    expect(board().slice(2 * PLANE, 3 * PLANE).filter(Boolean)).toHaveLength(0)
  })

  test('a pawn steps forward or up, never two squares', () => {
    // "a White Pawn at Ac2 can move to Ac3 (as in 2-D chess) or Bc2". At the
    // start Bc2 is taken, so the level-B pawn shows both.
    expect(sorted(movesFrom('Ac2').map(m => m.to))).toEqual(['Ac3'])
    expect(sorted(movesFrom('Bc2').map(m => m.to))).toEqual(['Bc3', 'Cc2'])
  })

  test('a pawn captures forward on its level and sideways upward', () => {
    // "... and capture at Ab3, Ad3 (as in 2-D chess), or at Bb2, Bd2"
    // Black pawns as the targets: a Knight on Ab3 would check the King on Aa1
    // and leave capturing it the only legal move.
    position([
      ['Ac2', 'pawn', 0],
      ['Ab3', 'pawn', 1], ['Ad3', 'pawn', 1], ['Bb2', 'pawn', 1], ['Bd2', 'pawn', 1],
      ['Bc3', 'pawn', 1],   // the disputed forward-upward capture, not played
    ])
    const captures = movesFrom('Ac2').filter(m => m.capture)
    expect(sorted(captures.map(m => m.to))).toEqual(['Ab3', 'Ad3', 'Bb2', 'Bd2'])
  })

  test('the Queen moves as Rook, Bishop and Unicorn together', () => {
    // "The Queen has the combined moves of Rook, Bishop and Unicorn."
    position([['Cc3', 'queen', 0]])
    const to = movesFrom('Cc3').map(m => name(m.to))
    expect(to).toContain('Ec3')   // up the column, as a Rook
    expect(to).toContain('Ec5')   // through an edge, as a Bishop
    expect(to).toContain('Dd4')   // through a corner, as a Unicorn
    // From the centre: 12 along lines, 24 along edges (8 in each of three
    // planes), 16 along corners - less Aa1, where White's own King stands.
    expect(to).toHaveLength(12 + 24 + 16 - 1)
  })

  test('the King steps through any face, edge or corner', () => {
    position([['Cc3', 'king', 0]])
    // Replace the corner king: one White king only.
    const state = game.getState()
    const cells = state.slice.board.slice()
    cells[sq('Aa1')] = null
    game.loadState({ slice: { ...state.slice, board: cells }, players: { currentIndex: 0 } })
    // 26 neighbours, less Dd4: on a 5x5x5 board every corner touches a
    // neighbour of the centre, and Dd4 touches Black's King on Ee5.
    const to = movesFrom('Cc3').map(m => name(m.to))
    expect(to).toHaveLength(25)
    expect(to).not.toContain('Dd4')
    expect(to).toEqual(expect.arrayContaining(['Bb2', 'Cc4', 'Dc3', 'Dd2']))
  })

  test('check comes through the levels', () => {
    // A Black Rook on Ea1 attacks the White King on Aa1 straight down the
    // column, so every legal move must answer it.
    position([['Ea1', 'rook', 1]])
    const answers = game.getLegalMoves()
    expect(answers.length).toBeGreaterThan(0)
    for (const m of answers) {
      expect(m.from).toBe(sq('Aa1'))
      expect(name(m.to)[1] + name(m.to)[2]).not.toBe('a1')
    }
  })

  test('a White pawn promotes on the far rank of levels A and B only', () => {
    // "Pawns promote on the last (or fifth) rank, which is the far side of
    // level A and level B for White"
    position([['Bb4', 'pawn', 0], ['Cd4', 'pawn', 0]])
    const onB = movesFrom('Bb4').filter(m => name(m.to) === 'Bb5')
    expect(onB.length).toBeGreaterThan(1)
    expect(onB.every(m => m.promotion)).toBe(true)
    expect(onB.map(m => m.promotion)).toContain('unicorn')
    const onC = movesFrom('Cd4').filter(m => name(m.to) === 'Cd5')
    expect(onC).toHaveLength(1)
    expect(onC[0].promotion).toBeUndefined()
  })

  test('it keeps playing through the volume', () => {
    let plies = 0
    for (; plies < 60; plies++) {
      const moves = game.getLegalMoves()
      if (!moves.length || game.checkWin()) break
      game.applyMove(moves[(plies * 7) % moves.length])
    }
    expect(plies).toBeGreaterThan(20)
    // Something reached level C, which nothing starts on.
    expect(board().slice(2 * PLANE, 3 * PLANE).filter(Boolean).length).toBeGreaterThan(0)
  })
})
