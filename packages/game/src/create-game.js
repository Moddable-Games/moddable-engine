import { createGame } from './game-factory.js'
import { createTopologyRegistry } from './topology-registry.js'

export function createGameFromDefinition(definition, opts = {}) {
  const { plugins = [], topologies = {}, rngSeed } = opts

  const topoRegistry = createTopologyRegistry()
  for (const [type, factory] of Object.entries(topologies)) {
    topoRegistry.register(type, factory)
  }

  let topologyFactory = null
  if (definition.topology && topoRegistry.has(definition.topology.type)) {
    topologyFactory = (config) => topoRegistry.create(config)
  }

  return createGame(definition, { plugins, topologyFactory, rngSeed })
}
