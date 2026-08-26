// International draughts declares `removeImmediately: false`: a captured piece
// stays on the board until the whole chain ends, so it blocks the rest of the
// chain and a flying king may not pass back over a piece it has already taken.
// The plugin carried the key in its `defaults` and read it nowhere. Worse, the
// guard that would have caught it was itself dead - the capture generator
// emptied the square, so the `alreadyCaptured` check below could never fire,
// because the piece it looked for was already gone.
//
// Every variant played as though the flag were true.
import { createDraughtsPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'

function createGame(extra) {
  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 10, cols: 10 },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { draughts: {} },
      render: { alternating: true },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: {
        draughts: (cfg, ctx) => createDraughtsPlugin(
          { ...cfg, rows: 10, cols: 10, flyingKings: true, ...extra }, ctx
        ),
      },
    }
  )
}

// The Turkish strike. A white king on a1 can take four men round a loop and
// come back facing the first one it took. If that man has already left the
// board the king passes over the empty square and takes a fifth; if it is
// still standing the loop ends one capture short.
const KING = 90
const MEN = [72, 45, 25, 41, 83]

function positioned(extra) {
  const game = createGame(extra)
  const board = new Array(100).fill(null)
  board[KING] = { type: 'king', owner: 0 }
  for (const i of MEN) board[i] = { type: 'man', owner: 1 }
  board[0] = { type: 'man', owner: 0 }
  game.store.set('draughts', { ...game.getState('draughts'), board }, 'draughts')
  return game
}

const longestChain = (game) => Math.max(
  0, ...game.getLegalMoves().map(m => (m.captures || m.captured || []).length)
)

describe('removeImmediately', () => {
  it('true lets the king pass over what it has already taken', () => {
    expect(longestChain(positioned({}))).toBe(5)
  })

  it('false leaves it standing, and the chain ends there', () => {
    expect(longestChain(positioned({ removeImmediately: false }))).toBe(4)
  })

  // The two must actually differ. An assertion that both are 4 would pass
  // against a plugin that had gone back to ignoring the flag entirely.
  it('the flag changes the answer', () => {
    expect(longestChain(positioned({}))).toBeGreaterThan(
      longestChain(positioned({ removeImmediately: false }))
    )
  })

  it('is a recognised config key', () => {
    expect(createDraughtsPlugin.configKeys.has('removeImmediately')).toBe(true)
  })
})
