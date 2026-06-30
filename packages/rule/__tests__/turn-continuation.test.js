import { createTurnContinuationRule } from '../src/rules/turn-continuation.js'

describe('turn-continuation rule', () => {
  describe('state-flag mode (morris pattern)', () => {
    it('continues when named boolean field is true', () => {
      const rule = createTurnContinuationRule({ mode: 'state-flag', field: 'awaitingRemoval' })
      const result = rule.hooks.continueTurn({}, { awaitingRemoval: true }, {})
      expect(result).toBe(true)
    })

    it('does not continue when field is false', () => {
      const rule = createTurnContinuationRule({ mode: 'state-flag', field: 'awaitingRemoval' })
      const result = rule.hooks.continueTurn({}, { awaitingRemoval: false }, {})
      expect(result).toBe(false)
    })

    it('does not continue when field is absent', () => {
      const rule = createTurnContinuationRule({ mode: 'state-flag', field: 'awaitingRemoval' })
      const result = rule.hooks.continueTurn({}, {}, {})
      expect(result).toBe(false)
    })

    it('returns false if no field configured', () => {
      const rule = createTurnContinuationRule({ mode: 'state-flag' })
      const result = rule.hooks.continueTurn({}, { anything: true }, {})
      expect(result).toBe(false)
    })
  })

  describe('remaining mode (backgammon pattern)', () => {
    it('continues when array field has items', () => {
      const rule = createTurnContinuationRule({ mode: 'remaining', field: 'movesRemaining' })
      const result = rule.hooks.continueTurn({}, { movesRemaining: [3, 5] }, {})
      expect(result).toBe(true)
    })

    it('does not continue when array field is empty', () => {
      const rule = createTurnContinuationRule({ mode: 'remaining', field: 'movesRemaining' })
      const result = rule.hooks.continueTurn({}, { movesRemaining: [] }, {})
      expect(result).toBe(false)
    })

    it('continues when numeric field is positive', () => {
      const rule = createTurnContinuationRule({ mode: 'remaining', field: 'actionsLeft' })
      const result = rule.hooks.continueTurn({}, { actionsLeft: 2 }, {})
      expect(result).toBe(true)
    })

    it('does not continue when numeric field is zero', () => {
      const rule = createTurnContinuationRule({ mode: 'remaining', field: 'actionsLeft' })
      const result = rule.hooks.continueTurn({}, { actionsLeft: 0 }, {})
      expect(result).toBe(false)
    })

    it('returns false if field is missing', () => {
      const rule = createTurnContinuationRule({ mode: 'remaining', field: 'movesRemaining' })
      const result = rule.hooks.continueTurn({}, {}, {})
      expect(result).toBe(false)
    })

    it('returns false if no field configured', () => {
      const rule = createTurnContinuationRule({ mode: 'remaining' })
      const result = rule.hooks.continueTurn({}, { movesRemaining: [1] }, {})
      expect(result).toBe(false)
    })
  })

  describe('predicate mode (mancala last-seed-in-store)', () => {
    it('calls the predicate function with move, state, ctx', () => {
      const pred = (move, state) => state.landedInStore
      const rule = createTurnContinuationRule({ mode: 'predicate', predicate: pred })
      const result = rule.hooks.continueTurn({ pit: 3 }, { landedInStore: true }, {})
      expect(result).toBe(true)
    })

    it('returns false when predicate returns false', () => {
      const pred = (move, state) => state.landedInStore
      const rule = createTurnContinuationRule({ mode: 'predicate', predicate: pred })
      const result = rule.hooks.continueTurn({ pit: 3 }, { landedInStore: false }, {})
      expect(result).toBe(false)
    })

    it('returns false if predicate is not a function', () => {
      const rule = createTurnContinuationRule({ mode: 'predicate', predicate: 'not-a-fn' })
      const result = rule.hooks.continueTurn({}, {}, {})
      expect(result).toBe(false)
    })

    it('returns false if predicate not configured', () => {
      const rule = createTurnContinuationRule({ mode: 'predicate' })
      const result = rule.hooks.continueTurn({}, {}, {})
      expect(result).toBe(false)
    })
  })

  describe('default mode', () => {
    it('defaults to state-flag', () => {
      const rule = createTurnContinuationRule({ field: 'active' })
      expect(rule.hooks.continueTurn({}, { active: true }, {})).toBe(true)
      expect(rule.hooks.continueTurn({}, { active: false }, {})).toBe(false)
    })
  })

  describe('composition with composeRules', () => {
    it('works as a standard rule via compose (OR strategy)', async () => {
      const { composeRules } = await import('../src/compose.js')
      const rule = createTurnContinuationRule({ mode: 'state-flag', field: 'waiting' })
      const other = {
        id: 'other',
        requires: [],
        hooks: { continueTurn: () => false },
      }
      const composed = composeRules([other, rule])
      expect(composed.continueTurn({}, { waiting: true }, {})).toBe(true)
      expect(composed.continueTurn({}, { waiting: false }, {})).toBe(false)
    })
  })

  it('has correct metadata', () => {
    const rule = createTurnContinuationRule()
    expect(rule.id).toBe('turn.continuation')
    expect(rule.category).toBe('turn')
    expect(rule.requires).toEqual([])
  })
})
