import { createSimulator } from '../../ai/src/simulator.js'
import { EVALUATORS } from '../../ai/src/evaluators.js'
import { createGameForFamily } from './play.js'

export function createSimulatorForFamily(family, state, opts = {}) {
  const game = createGameForFamily(family, {
    variant: opts.variant,
    definition: opts.definition,
    rngSeed: opts.rngSeed || 42,
  })

  if (state) {
    game.loadState(state)
  }

  const rawGame = game.raw
  const plugin = rawGame.registry.getPlugins().find(p => p.sliceName === family)
  if (!plugin) {
    throw new Error(`Plugin "${family}" not found after game creation`)
  }

  const playerCount = rawGame.definition.players.names
    ? rawGame.definition.players.names.length
    : (rawGame.definition.players.length || 2)

  const evaluate = opts.evaluate || EVALUATORS[family] || null

  return createSimulator(plugin, { playerCount, evaluate })
}
