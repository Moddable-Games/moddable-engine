import { getGameConfig } from './game-registry.js'

export function generateMap(game, opts = {}) {
  const config = getGameConfig(game)
  if (!config) {
    throw new Error(`Unknown hex game: "${game}". Available: ${Object.keys(getAllGamesInternal()).join(', ')}`)
  }
  if (!config.generate) {
    throw new Error(`Game "${game}" does not have a generate function`)
  }

  const { size, players, seed, layout } = opts
  return config.generate(
    size ?? config.defaultSize ?? 3,
    players ?? config.defaultPlayers ?? 2,
    seed ?? null,
    layout ?? null
  )
}

import { getAllGames as getAllGamesInternal } from './game-registry.js'
