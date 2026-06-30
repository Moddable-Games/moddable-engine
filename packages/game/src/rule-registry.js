import { composeRules } from '../../rule/index.js'
import { resolveOrder, validateTopologyNeeds } from '../../rule/index.js'

export function createRuleRegistry() {
  const factories = new Map()

  function register(id, factory) {
    if (typeof factory !== 'function') {
      throw new Error(`Rule "${id}" must be registered with a factory function`)
    }
    factories.set(id, factory)
  }

  function create(id, config = {}) {
    const factory = factories.get(id)
    if (!factory) {
      throw new Error(`No rule factory registered for "${id}"`)
    }
    const rule = factory(config)
    if (!rule.id) rule.id = id
    return rule
  }

  function has(id) {
    return factories.has(id)
  }

  return { register, create, has }
}

export function resolveRuleOverrides(baseRules, overrides, registry) {
  const active = [...baseRules]

  for (const override of overrides) {
    if (typeof override === 'string') {
      if (!active.find(r => r.id === override) && registry.has(override)) {
        active.push(registry.create(override))
      }
    } else if (typeof override === 'object') {
      for (const [id, config] of Object.entries(override)) {
        if (config === false || (config && config.enabled === false)) {
          const idx = active.findIndex(r => r.id === id)
          if (idx !== -1) active.splice(idx, 1)
        } else if (typeof config === 'object') {
          const idx = active.findIndex(r => r.id === id)
          if (idx !== -1) {
            active[idx] = registry.create(id, config)
          } else if (registry.has(id)) {
            active.push(registry.create(id, config))
          }
        }
      }
    }
  }

  return active
}

export function wrapPluginWithRules(plugin, registry, overrides = []) {
  const baseRules = plugin.rules.map(id => {
    const config = (plugin.ruleDefaults && plugin.ruleDefaults[id]) || {}
    return registry.create(id, config)
  })

  const finalRules = resolveRuleOverrides(baseRules, overrides, registry)
  const ruleConfigs = {}
  for (const rule of finalRules) {
    const id = rule.id
    if (plugin.ruleDefaults && plugin.ruleDefaults[id]) {
      ruleConfigs[id] = plugin.ruleDefaults[id]
    }
  }

  const composed = composeRules(finalRules, ruleConfigs)
  plugin._composedRules = composed
}
