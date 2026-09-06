import { createGameFromDefinition } from '../../../game/index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'
import { createGoPlugin } from '../index.js'

// engine#162. Go was the one family that could not open from a position.
// `setup` was in CONFIG_KEYS and read nowhere, so every variant started from an
// empty board however its frontmatter opened: Sunjang Baduk's sixteen
// pre-placed stones and Tibetan Go's twelve were declared and discarded, and
// nothing said so, because an empty go board is what an empty go board looks
// like.
//
// The stones go in as an ordinary position string parsed by the topology, the
// same path every other family already used, so the plugin needs no notion of
// what a handicap or an opening pattern is.

function createGame(size, extraConfig = {}) {
  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: size, cols: size },
      players: { names: ['black', 'white'], count: 2 },
      plugins: { go: {} },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: {
        go: (config, ctx) => createGoPlugin({ ...config, size, rows: size, cols: size, ...extraConfig }, ctx),
      },
    }
  )
}

const stonesOn = (board) =>
  board.map((cell, i) => (cell ? [i, cell] : null)).filter(Boolean)

describe('go opens from a declared position (engine#162)', () => {
  it('starts empty when the setup is empty, as every variant does today', () => {
    for (const setup of ['', undefined]) {
      const board = createGame(9, { setup }).getState('go').board
      expect(stonesOn(board)).toEqual([])
      expect(board).toHaveLength(81)
    }
  })

  it('places the stones a position string declares, on both colours', () => {
    const board = createGame(9, { setup: '9/9/2b3b2/9/9/9/2w3w2/9/9' }).getState('go').board
    expect(stonesOn(board)).toEqual([
      [20, 'black'], [24, 'black'],
      [56, 'white'], [60, 'white'],
    ])
  })

  it('takes the pre-placed stones out of play rather than leaving them selectable', () => {
    const empty = createGame(9, { setup: '' })
    const opened = createGame(9, { setup: '9/9/2b3b2/9/9/9/2w3w2/9/9' })
    expect(opened.getLegalMoves().length).toBe(empty.getLegalMoves().length - 4)
  })

  it('plays on from the position, so a pre-placed stone can be captured', () => {
    // One black stone in the corner. Its only liberties are 1 and 9, so white's
    // second move takes it - which it cannot do unless the stone is really on
    // the board and really black's.
    const game = createGame(9, { setup: 'b8/9/9/9/9/9/9/9/9' })
    expect(game.getState('go').board[0]).toBe('black')

    game.execute({ coord: 40 })  // black, elsewhere
    game.execute({ coord: 1 })   // white, first liberty
    game.execute({ coord: 41 })  // black, elsewhere
    game.execute({ coord: 9 })   // white, last liberty

    const state = game.getState('go')
    expect(state.board[0]).toBe(null)
    expect(state.captures[1]).toBe(1)
  })
})
