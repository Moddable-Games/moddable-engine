import { createRegistry, createStore, createPlayerSystem, createHistory, createEventBus, createPipeline, createRng } from '../../core/index.js'

export function createGame(definition, opts = {}) {
  const { plugins = [], topologyFactory, rngSeed, boardTheme = null, pieceResolver = null, components = {} } = opts

  const registry = createRegistry()

  if (rngSeed !== undefined) {
    const rng = createRng(rngSeed)
    registry.provide('core.rng', rng)
  }

  let topology = null
  if (definition.topology && topologyFactory) {
    topology = topologyFactory(definition.topology)
    registry.provide('core.topology', topology)
  }

  for (const [componentType, component] of Object.entries(components)) {
    registry.provide(`component.${componentType}`, component)
  }

  for (const plugin of plugins) {
    registry.register(plugin)
  }

  const playerSystem = createPlayerSystem({ players: definition.players.names })
  const store = createStore({})

  const pluginConfigs = {}
  for (const plugin of plugins) {
    pluginConfigs[plugin.sliceName] = definition.plugins[plugin.sliceName] || {}
  }

  registry.initAll(pluginConfigs, store)
  store.set(playerSystem.sliceName, playerSystem.initState(), playerSystem.sliceName)

  const history = createHistory()
  const eventBus = createEventBus()
  const pipeline = createPipeline(registry, store, history, playerSystem, eventBus)

  return {
    topology,
    store,
    playerSystem,
    history,
    eventBus,
    pipeline,
    registry,
    definition,
    boardTheme,
    pieceResolver,
    components,

    execute(move) {
      return pipeline.execute(move)
    },

    getLegalMoves() {
      return pipeline.getLegalMoves()
    },

    currentPlayer() {
      return playerSystem.current(store)
    },

    getState(sliceName) {
      return store.get(sliceName)
    },

    undo() {
      return history.undo(store)
    },

    getLayout(opts) {
      if (!topology || !topology.getLayout) return null
      return topology.getLayout(opts || definition.render || {})
    },
  }
}
