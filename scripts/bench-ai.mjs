/**
 * AI performance benchmark — bare node, no jest overhead.
 * Run: node --experimental-vm-modules scripts/bench-ai.mjs
 * Exits 1 if NPS falls below floor.
 */
import { createMinimax } from '../packages/ai/src/minimax.js'
import { createSimulator } from '../packages/ai/src/simulator.js'
import { EVALUATORS } from '../packages/ai/src/evaluators.js'
import { createChessPlugin } from '../packages/plugins/chess/index.js'
import { createGameFromDefinition } from '../packages/game/index.js'
import { createGridTopology } from '../packages/topologies/grid/index.js'

const MIDGAME_FEN = 'r1bq1rk1/ppp2ppp/2n2n2/3pp3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQ - 0 6'
const BUDGET_MS = 2000
const NPS_FLOOR = 2000

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
const move = engine.search(state, 0)
const elapsed = Date.now() - start
const nps = Math.round(nodes / (elapsed / 1000))

console.log(`AI bench: ${nodes} nodes in ${elapsed}ms = ${nps} nps`)
console.log(`  Position: ${MIDGAME_FEN.slice(0, 50)}...`)
console.log(`  Move: ${move ? move.from + '→' + move.to : 'null'}`)
console.log(`  Key length: ${plugin.positionKey(state, 0).length} chars`)
console.log(`  Floor: ${NPS_FLOOR} nps`)

if (nps < NPS_FLOOR) {
  console.error(`FAIL: ${nps} nps is below floor of ${NPS_FLOOR}`)
  process.exit(1)
} else {
  console.log(`PASS: ${nps} nps exceeds floor of ${NPS_FLOOR}`)
}
