import { createMinimax } from '../src/minimax.js'
import { createSimulator } from '../src/simulator.js'
import { EVALUATORS } from '../src/evaluators.js'
import { createGameForFamily } from '../../play/src/play.js'
import { createChessPlugin } from '../../plugins/chess/index.js'
import { createGameFromDefinition } from '../../game/index.js'
import { createGridTopology } from '../../topologies/grid/index.js'

const MIDGAME_FEN = 'r1bq1rk1/ppp2ppp/2n2n2/3pp3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQ - 0 6'
const BUDGET_MS = 2000
// Measured 2026-08-05: Jest median ~660 nps from this midgame after pseudo-mobility fix.
// The Jest VM adds substantial overhead; bare-node is ~2300 nps.
// RATCHET RULE: this floor must be raised whenever throughput improves. A floor far
// below current measurement protects nothing — it must sit at ~80% of observed Jest median.
// If this test flakes under parallel execution, the cause is CPU contention. Run with
// --runInBand or move to its own CI job. Never lower the floor to fix a flake.
const NPS_FLOOR = 520

function createChessGame(setup) {
  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: { setup, castling: true, enPassant: true } },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: { chess: (cfg, ctx) => createChessPlugin(cfg, ctx) },
    }
  )
}

describe('AI performance benchmark', () => {
  it(`generic chess search exceeds ${NPS_FLOOR} nodes/sec from midgame`, () => {
    const game = createChessGame(MIDGAME_FEN)
    const plugin = game.registry.getPlugins().find(p => p.sliceName === 'chess')
    const playerNames = game.definition.players.names
    const sim = createSimulator(plugin, { playerCount: 2, playerNames, evaluate: EVALUATORS.chess })

    let nodes = 0
    const wrapped = {
      ...sim,
      getLegalMoves(s, p) { nodes++; return sim.getLegalMoves(s, p) },
      positionKey: sim.positionKey,
    }

    const engine = createMinimax(wrapped, { timeLimit: BUDGET_MS, depth: 50, topN: 1, spread: 0 })
    const state = game.getState('chess')
    const start = Date.now()
    engine.search(state, 0)
    const elapsed = Date.now() - start
    const nps = Math.round(nodes / (elapsed / 1000))

    console.log(`  [perf] ${nodes} nodes in ${elapsed}ms = ${nps} nps`)
    expect(nps).toBeGreaterThan(NPS_FLOOR)
  })

  it('chess plugin provides a positionKey under 100 chars', () => {
    const game = createChessGame(MIDGAME_FEN)
    const plugin = game.registry.getPlugins().find(p => p.sliceName === 'chess')
    const state = game.getState('chess')
    const key = plugin.positionKey(state, 0)

    expect(typeof key).toBe('string')
    expect(key.length).toBeLessThan(100)
    expect(key).toContain('/')
  })

  it('positionKey changes with board state and player', () => {
    const game = createChessGame(MIDGAME_FEN)
    const plugin = game.registry.getPlugins().find(p => p.sliceName === 'chess')
    const state = game.getState('chess')

    const keyW = plugin.positionKey(state, 0)
    const keyB = plugin.positionKey(state, 1)
    expect(keyW).not.toBe(keyB)

    const moves = plugin.getLegalMoves(state, { __players: { currentIndex: 0 }, chess: state })
    const result = plugin.applyMove(moves[0], state, { __players: { currentIndex: 0 }, chess: state })
    const newState = result.state || result
    const keyAfter = plugin.positionKey(newState, 1)
    expect(keyAfter).not.toBe(keyW)
  })
})
