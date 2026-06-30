import { createGame } from './game-factory.js'
import { createTopologyRegistry } from './topology-registry.js'
import { createComponentRegistry } from './component-registry.js'
import { createRuleRegistry, resolveRuleOverrides, wrapPluginWithRules } from './rule-registry.js'
import { bindTraversal } from '../../core/src/bind-traversal.js'

export function createGameFromDefinition(definition, opts = {}) {
  const { plugins = [], pluginFactories = {}, topologies = {}, components = {}, rules = {}, rngSeed, boardTheme = null, pieceResolver = null } = opts

  const topoRegistry = createTopologyRegistry()
  for (const [type, factory] of Object.entries(topologies)) {
    topoRegistry.register(type, factory)
  }

  const componentRegistry = createComponentRegistry()
  for (const [key, factory] of Object.entries(components)) {
    const [componentType, type] = key.includes('.') ? key.split('.') : [key, 'default']
    componentRegistry.register(componentType, type, factory)
  }

  let topologyFactory = null
  if (definition.topology && topoRegistry.has(definition.topology.type)) {
    topologyFactory = (config) => {
      const topology = topoRegistry.create(config)
      bindTraversal(topology)
      return topology
    }
  }

  const createdComponents = {}
  if (definition.components) {
    for (const [componentType, config] of Object.entries(definition.components)) {
      if (componentRegistry.has(componentType, config.type || 'default')) {
        createdComponents[componentType] = componentRegistry.create(componentType, config)
      }
    }
  }

  const allPlugins = [...plugins]
  for (const [sliceName, factory] of Object.entries(pluginFactories)) {
    const pluginConfig = (definition.plugins && definition.plugins[sliceName]) || {}
    const plugin = factory(pluginConfig, { definition, boardTheme, pieceResolver, components: createdComponents })
    allPlugins.push(plugin)
  }

  const ruleRegistry = createRuleRegistry()
  for (const [id, factory] of Object.entries(rules)) {
    ruleRegistry.register(id, factory)
  }

  for (const plugin of allPlugins) {
    if (!plugin.rules) continue
    const overrides = definition.rules || []
    wrapPluginWithRules(plugin, ruleRegistry, overrides)
  }

  return createGame(definition, { plugins: allPlugins, topologyFactory, rngSeed, boardTheme, pieceResolver, components: createdComponents })
}
