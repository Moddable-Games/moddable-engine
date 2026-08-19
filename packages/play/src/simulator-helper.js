import { createSimulator, getEvaluator } from '../../ai/index.js'
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

  const playerNames = rawGame.definition.players.names || null
  const playerCount = playerNames
    ? playerNames.length
    : (rawGame.definition.players.length || 2)

  const evaluate = opts.evaluate || getEvaluator(family)

  return createSimulator(plugin, { playerCount, playerNames, evaluate })
}
