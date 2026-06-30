import { composeRules } from '../index.js'

function makeRule(id, hooks = {}, opts = {}) {
  return { id, requires: opts.requires || [], hooks, provides: opts.provides || null }
}

describe('composeRules', () => {
  describe('init — MERGE strategy', () => {
    it('merges state fragments from all rules', () => {
      const rules = [
        makeRule('a', { init: () => ({ x: 1 }) }),
        makeRule('b', { init: () => ({ y: 2 }) }),
      ]
      const composed = composeRules(rules)
      const state = composed.init({})
      expect(state).toEqual({ x: 1, y: 2 })
    })

    it('later rules override same keys', () => {
      const rules = [
        makeRule('a', { init: () => ({ x: 1 }) }),
        makeRule('b', { init: () => ({ x: 2 }) }),
      ]
      const composed = composeRules(rules)
      expect(composed.init({})).toEqual({ x: 2 })
    })

    it('skips rules without init hook', () => {
      const rules = [
        makeRule('a', {}),
        makeRule('b', { init: () => ({ y: 5 }) }),
      ]
      const composed = composeRules(rules)
      expect(composed.init({})).toEqual({ y: 5 })
    })
  })

  describe('validateMove — ALL must pass (AND)', () => {
    it('passes when all rules pass', () => {
      const rules = [
        makeRule('a', { validateMove: () => true }),
        makeRule('b', { validateMove: () => true }),
      ]
      const composed = composeRules(rules)
      expect(composed.validateMove({}, {}, {})).toBe(true)
    })

    it('fails when any rule returns false', () => {
      const rules = [
        makeRule('a', { validateMove: () => true }),
        makeRule('b', { validateMove: () => false }),
      ]
      const composed = composeRules(rules)
      expect(composed.validateMove({}, {}, {})).toBe(false)
    })

    it('undefined (abstain) does not reject', () => {
      const rules = [
        makeRule('a', { validateMove: () => undefined }),
        makeRule('b', { validateMove: () => true }),
      ]
      const composed = composeRules(rules)
      expect(composed.validateMove({}, {}, {})).toBe(true)
    })

    it('short-circuits on first false', () => {
      let bCalled = false
      const rules = [
        makeRule('a', { validateMove: () => false }),
        makeRule('b', { validateMove: () => { bCalled = true; return true } }),
      ]
      const composed = composeRules(rules)
      composed.validateMove({}, {}, {})
      expect(bCalled).toBe(false)
    })
  })

  describe('applyMove — CHAIN + MERGE', () => {
    it('chains state through rules in order', () => {
      const rules = [
        makeRule('a', { applyMove: (move, state) => ({ count: (state.count || 0) + 1 }) }),
        makeRule('b', { applyMove: (move, state) => ({ count: state.count + 10 }) }),
      ]
      const composed = composeRules(rules)
      const result = composed.applyMove({}, { count: 0 }, {})
      expect(result.count).toBe(11)
    })

    it('merges non-overlapping fields', () => {
      const rules = [
        makeRule('a', { applyMove: () => ({ x: 1 }) }),
        makeRule('b', { applyMove: () => ({ y: 2 }) }),
      ]
      const composed = composeRules(rules)
      const result = composed.applyMove({}, {}, {})
      expect(result).toEqual({ x: 1, y: 2 })
    })

    it('skips rules returning null', () => {
      const rules = [
        makeRule('a', { applyMove: () => ({ x: 1 }) }),
        makeRule('b', { applyMove: () => null }),
      ]
      const composed = composeRules(rules)
      const result = composed.applyMove({}, {}, {})
      expect(result).toEqual({ x: 1 })
    })
  })

  describe('moveFilter — PIPELINE', () => {
    it('chains filters: output of one feeds next', () => {
      const rules = [
        makeRule('a', { moveFilter: (moves) => moves.filter(m => m.valid) }),
        makeRule('b', { moveFilter: (moves) => moves.filter(m => m.safe) }),
      ]
      const composed = composeRules(rules)
      const moves = [
        { valid: true, safe: true },
        { valid: true, safe: false },
        { valid: false, safe: true },
      ]
      const result = composed.moveFilter(moves, {}, {})
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ valid: true, safe: true })
    })
  })

  describe('getLegalMoves — UNION', () => {
    it('merges moves from all rules', () => {
      const rules = [
        makeRule('a', { getLegalMoves: () => [{ from: 0, to: 1 }] }),
        makeRule('b', { getLegalMoves: () => [{ from: 2, to: 3 }] }),
      ]
      const composed = composeRules(rules)
      const moves = composed.getLegalMoves({}, {})
      expect(moves).toHaveLength(2)
    })

    it('handles rules returning null', () => {
      const rules = [
        makeRule('a', { getLegalMoves: () => null }),
        makeRule('b', { getLegalMoves: () => [{ from: 0, to: 1 }] }),
      ]
      const composed = composeRules(rules)
      expect(composed.getLegalMoves({}, {})).toHaveLength(1)
    })
  })

  describe('checkWin — FIRST non-null', () => {
    it('returns first non-null result', () => {
      const rules = [
        makeRule('a', { checkWin: () => null }),
        makeRule('b', { checkWin: () => 'white' }),
        makeRule('c', { checkWin: () => 'draw' }),
      ]
      const composed = composeRules(rules)
      expect(composed.checkWin({}, {})).toBe('white')
    })

    it('returns null when no rule declares winner', () => {
      const rules = [
        makeRule('a', { checkWin: () => null }),
      ]
      const composed = composeRules(rules)
      expect(composed.checkWin({}, {})).toBeNull()
    })
  })

  describe('continueTurn — ANY true (OR)', () => {
    it('returns true if any rule says true', () => {
      const rules = [
        makeRule('a', { continueTurn: () => false }),
        makeRule('b', { continueTurn: () => true }),
      ]
      const composed = composeRules(rules)
      expect(composed.continueTurn({}, {}, {})).toBe(true)
    })

    it('returns false when all say false', () => {
      const rules = [
        makeRule('a', { continueTurn: () => false }),
        makeRule('b', { continueTurn: () => false }),
      ]
      const composed = composeRules(rules)
      expect(composed.continueTurn({}, {}, {})).toBe(false)
    })
  })

  describe('captureEffect — FIRST non-null', () => {
    it('returns first non-null capture effect', () => {
      const rules = [
        makeRule('a', { captureEffect: () => null }),
        makeRule('b', { captureEffect: () => [5, 6] }),
      ]
      const composed = composeRules(rules)
      expect(composed.captureEffect(4, {}, {})).toEqual([5, 6])
    })
  })

  describe('dependency ordering', () => {
    it('runs dependent rules after their dependencies', () => {
      const order = []
      const rules = [
        makeRule('dependent', {
          applyMove: () => { order.push('dependent'); return null }
        }, { requires: ['base'] }),
        makeRule('base', {
          applyMove: () => { order.push('base'); return null }
        }),
      ]
      const composed = composeRules(rules)
      composed.applyMove({}, {}, {})
      expect(order).toEqual(['base', 'dependent'])
    })
  })

  describe('provides access', () => {
    it('makes provides available via context.rules', () => {
      let capturedCtx = null
      const rules = [
        makeRule('provider', {}, {
          provides: { helper: () => 42 },
        }),
        makeRule('consumer', {
          applyMove: (move, state, ctx) => { capturedCtx = ctx; return null },
        }, { requires: ['provider'] }),
      ]
      const composed = composeRules(rules)
      composed.applyMove({}, {}, {})
      expect(capturedCtx.rules.get('provider').helper()).toBe(42)
    })
  })
})
