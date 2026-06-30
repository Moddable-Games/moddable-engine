import { resolveOrder } from './resolve-dependencies.js'

export function composeRules(rules, ruleConfigs = {}) {
  const ordered = resolveOrder(rules)

  const providesMap = new Map()
  for (const rule of ordered) {
    if (rule.provides) {
      providesMap.set(rule.id, rule.provides)
    }
  }

  function buildContext(baseCtx, rule) {
    return {
      ...baseCtx,
      config: ruleConfigs[rule.id] || {},
      rules: providesMap,
    }
  }

  const composed = {}

  composed.init = function initComposed(baseCtx) {
    let merged = {}
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.init) continue
      const ctx = buildContext(baseCtx, rule)
      const fragment = rule.hooks.init(ctx.config, ctx)
      if (fragment) Object.assign(merged, fragment)
    }
    return merged
  }

  composed.validateMove = function validateMoveComposed(move, state, baseCtx) {
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.validateMove) continue
      const ctx = buildContext({ ...baseCtx, sliceState: state }, rule)
      const result = rule.hooks.validateMove(move, state, ctx)
      if (result === false) return false
    }
    return true
  }

  composed.beforeMove = function beforeMoveComposed(move, state, baseCtx) {
    let current = state
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.beforeMove) continue
      const ctx = buildContext({ ...baseCtx, sliceState: current }, rule)
      const fragment = rule.hooks.beforeMove(move, current, ctx)
      if (fragment) current = { ...current, ...fragment }
    }
    return current
  }

  composed.applyMove = function applyMoveComposed(move, state, baseCtx) {
    let current = state
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.applyMove) continue
      const ctx = buildContext({ ...baseCtx, sliceState: current }, rule)
      const fragment = rule.hooks.applyMove(move, current, ctx)
      if (fragment) current = { ...current, ...fragment }
    }
    return current
  }

  composed.afterMove = function afterMoveComposed(move, state, baseCtx) {
    let current = state
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.afterMove) continue
      const ctx = buildContext({ ...baseCtx, sliceState: current }, rule)
      const fragment = rule.hooks.afterMove(move, current, ctx)
      if (fragment) current = { ...current, ...fragment }
    }
    return current
  }

  composed.captureEffect = function captureEffectComposed(target, state, baseCtx) {
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.captureEffect) continue
      const ctx = buildContext({ ...baseCtx, sliceState: state }, rule)
      const result = rule.hooks.captureEffect(target, state, ctx)
      if (result !== null && result !== undefined) return result
    }
    return null
  }

  composed.moveFilter = function moveFilterComposed(moves, state, baseCtx) {
    let current = moves
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.moveFilter) continue
      const ctx = buildContext({ ...baseCtx, sliceState: state }, rule)
      current = rule.hooks.moveFilter(current, state, ctx)
    }
    return current
  }

  composed.getLegalMoves = function getLegalMovesComposed(state, baseCtx) {
    const allMoves = []
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.getLegalMoves) continue
      const ctx = buildContext({ ...baseCtx, sliceState: state }, rule)
      const moves = rule.hooks.getLegalMoves(state, ctx)
      if (moves) allMoves.push(...moves)
    }
    return allMoves
  }

  composed.checkWin = function checkWinComposed(state, baseCtx) {
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.checkWin) continue
      const ctx = buildContext({ ...baseCtx, sliceState: state }, rule)
      const result = rule.hooks.checkWin(state, ctx)
      if (result !== null && result !== undefined) return result
    }
    return null
  }

  composed.continueTurn = function continueTurnComposed(move, state, baseCtx) {
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.continueTurn) continue
      const ctx = buildContext({ ...baseCtx, sliceState: state }, rule)
      if (rule.hooks.continueTurn(move, state, ctx)) return true
    }
    return false
  }

  composed.turnAdvancement = function turnAdvancementComposed(state, baseCtx) {
    for (const rule of ordered) {
      if (!rule.hooks || !rule.hooks.turnAdvancement) continue
      const ctx = buildContext({ ...baseCtx, sliceState: state }, rule)
      const result = rule.hooks.turnAdvancement(state, ctx)
      if (result !== null && result !== undefined) return result
    }
    return null
  }

  return composed
}
