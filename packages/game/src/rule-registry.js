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
  plugin._rules = finalRules

  const originalGetLegalMoves = plugin.getLegalMoves
  const originalApplyMove = plugin.applyMove
  const originalCheckWin = plugin.checkWin
  const originalInit = plugin.init

  if (composed.init) {
    plugin.init = function wrappedInit(pluginConfig, context) {
      const baseState = originalInit.call(plugin, pluginConfig, context)
      const topology = context.request('core.topology')
      const ruleState = composed.init({ topology, playerCount: 2 })
      return { ...baseState, ...ruleState }
    }
  }

  if (composed.getLegalMoves) {
    plugin.getLegalMoves = function wrappedGetLegalMoves(slice, full) {
      const baseMoves = originalGetLegalMoves.call(plugin, slice, full)
      const playerIndex = full.__players.currentIndex
      const topology = plugin._topology
      const ctx = {
        topology,
        playerIndex,
        playerCount: 2,
        fullState: full,
        sliceState: slice,
        config: plugin._ruleConfig || {},
      }
      const ruleMoves = composed.getLegalMoves(slice, ctx) || []
      const allMoves = [...baseMoves, ...ruleMoves]

      if (composed.moveFilter) {
        return composed.moveFilter(allMoves, slice, ctx)
      }
      return allMoves
    }
  }

  if (composed.applyMove) {
    plugin.applyMove = function wrappedApplyMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex
      const topology = plugin._topology
      const ctx = {
        topology,
        playerIndex,
        playerCount: 2,
        fullState: full,
        sliceState: slice,
        config: plugin._ruleConfig || {},
      }

      let current = slice
      if (composed.beforeMove) {
        current = composed.beforeMove(move, current, ctx)
      }

      const baseResult = originalApplyMove.call(plugin, move, current, full)
      let result = baseResult

      const ruleResult = composed.applyMove(move, current, ctx)
      if (ruleResult) {
        result = { ...result, ...ruleResult }
      }

      if (composed.afterMove) {
        result = composed.afterMove(move, result, ctx)
      }

      return result
    }
  }

  if (composed.checkWin) {
    plugin.checkWin = function wrappedCheckWin(slice, full) {
      const baseResult = originalCheckWin.call(plugin, slice, full)
      if (baseResult !== null) return baseResult

      const playerIndex = full.__players.currentIndex
      const topology = plugin._topology
      const ctx = {
        topology,
        playerIndex,
        playerCount: 2,
        fullState: full,
        sliceState: slice,
        config: plugin._ruleConfig || {},
      }
      return composed.checkWin(slice, ctx)
    }
  }
}
