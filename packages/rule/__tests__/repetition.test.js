import { createRepetitionRule } from '../src/rules/repetition.js'

describe('repetition rule', () => {
  describe('ko mode (Go pattern)', () => {
    it('initialises with null last hash', () => {
      const rule = createRepetitionRule({ mode: 'ko' })
      const state = rule.hooks.init({})
      expect(state._repetitionLastHash).toBe(null)
    })

    it('records hash after a move', () => {
      const rule = createRepetitionRule({ mode: 'ko', stateKey: 'board' })
      const state = { board: ['black', null, null], _repetitionLastHash: null }
      const result = rule.hooks.afterMove({ coord: 0 }, state, {})
      expect(result._repetitionLastHash).toBeDefined()
      expect(typeof result._repetitionLastHash).toBe('string')
    })

    it('validates when no prior hash exists', () => {
      const rule = createRepetitionRule({ mode: 'ko' })
      const state = { board: [null, null], _repetitionLastHash: null }
      expect(rule.hooks.validateMove({ coord: 0 }, state, {})).toBe(true)
    })

    it('validates pass moves (no projection)', () => {
      const rule = createRepetitionRule({ mode: 'ko' })
      const state = { board: ['X', null], _repetitionLastHash: 'X.' }
      expect(rule.hooks.validateMove({ action: 'pass' }, state, {})).toBe(true)
    })

    it('does not trigger checkWin', () => {
      const rule = createRepetitionRule({ mode: 'ko' })
      expect(rule.hooks.checkWin({ _repetitionLastHash: 'abc' }, {})).toBe(null)
    })
  })

  describe('superko mode (Go superko)', () => {
    it('initialises with empty history', () => {
      const rule = createRepetitionRule({ mode: 'superko' })
      const state = rule.hooks.init({})
      expect(state._repetitionHistory).toEqual([])
    })

    it('accumulates hashes after moves', () => {
      const rule = createRepetitionRule({ mode: 'superko', stateKey: 'board' })
      const state1 = { board: ['black', null], _repetitionHistory: [] }
      const frag1 = rule.hooks.afterMove({}, state1, {})
      expect(frag1._repetitionHistory.length).toBe(1)

      const state2 = { board: [null, 'white'], _repetitionHistory: frag1._repetitionHistory }
      const frag2 = rule.hooks.afterMove({}, state2, {})
      expect(frag2._repetitionHistory.length).toBe(2)
    })

    it('validates pass moves', () => {
      const rule = createRepetitionRule({ mode: 'superko' })
      const state = { board: ['X'], _repetitionHistory: ['X'] }
      expect(rule.hooks.validateMove({ action: 'pass' }, state, {})).toBe(true)
    })

    it('does not trigger checkWin', () => {
      const rule = createRepetitionRule({ mode: 'superko' })
      expect(rule.hooks.checkWin({ _repetitionHistory: ['a', 'b'] }, {})).toBe(null)
    })
  })

  describe('count mode (chess threefold repetition)', () => {
    it('initialises with empty counts', () => {
      const rule = createRepetitionRule({ mode: 'count' })
      const state = rule.hooks.init({})
      expect(state._repetitionCounts).toEqual({})
    })

    it('increments count for each position', () => {
      const rule = createRepetitionRule({ mode: 'count', stateKey: 'board' })
      const state = { board: ['R', null, 'K'], _repetitionCounts: {} }
      const frag = rule.hooks.afterMove({}, state, {})
      expect(Object.values(frag._repetitionCounts)[0]).toBe(1)
    })

    it('accumulates counts for repeated positions', () => {
      const rule = createRepetitionRule({ mode: 'count', stateKey: 'board' })
      const hash = 'R.K'
      const state = { board: ['R', null, 'K'], _repetitionCounts: { [hash]: 2 } }
      const frag = rule.hooks.afterMove({}, state, {})
      expect(frag._repetitionCounts[hash]).toBe(3)
    })

    it('declares draw when threshold reached', () => {
      const rule = createRepetitionRule({ mode: 'count', threshold: 3 })
      const counts = { 'R.K': 3 }
      expect(rule.hooks.checkWin({ _repetitionCounts: counts }, {})).toBe('draw')
    })

    it('does not declare draw below threshold', () => {
      const rule = createRepetitionRule({ mode: 'count', threshold: 3 })
      const counts = { 'R.K': 2 }
      expect(rule.hooks.checkWin({ _repetitionCounts: counts }, {})).toBe(null)
    })

    it('supports custom threshold', () => {
      const rule = createRepetitionRule({ mode: 'count', threshold: 5 })
      const counts = { 'abc': 5 }
      expect(rule.hooks.checkWin({ _repetitionCounts: counts }, {})).toBe('draw')
    })
  })

  describe('hashing', () => {
    it('hashes array boards', () => {
      const rule = createRepetitionRule({ mode: 'count', stateKey: 'board' })
      const state1 = { board: ['black', null, 'white'], _repetitionCounts: {} }
      const state2 = { board: ['black', null, 'white'], _repetitionCounts: {} }
      const frag1 = rule.hooks.afterMove({}, state1, {})
      const frag2 = rule.hooks.afterMove({}, state2, {})
      const key1 = Object.keys(frag1._repetitionCounts)[0]
      const key2 = Object.keys(frag2._repetitionCounts)[0]
      expect(key1).toBe(key2)
    })

    it('different boards produce different hashes', () => {
      const rule = createRepetitionRule({ mode: 'count', stateKey: 'board' })
      const state1 = { board: ['black', null, null], _repetitionCounts: {} }
      const state2 = { board: [null, 'black', null], _repetitionCounts: {} }
      const frag1 = rule.hooks.afterMove({}, state1, {})
      const frag2 = rule.hooks.afterMove({}, state2, {})
      const key1 = Object.keys(frag1._repetitionCounts)[0]
      const key2 = Object.keys(frag2._repetitionCounts)[0]
      expect(key1).not.toBe(key2)
    })

    it('hashes object boards (morris nodes)', () => {
      const rule = createRepetitionRule({ mode: 'count', stateKey: 'nodes' })
      const state = { nodes: { a1: 'W', b2: null, c3: 'B' }, _repetitionCounts: {} }
      const frag = rule.hooks.afterMove({}, state, {})
      expect(Object.keys(frag._repetitionCounts).length).toBe(1)
    })

    it('supports custom hash function', () => {
      const customHash = (board) => board.filter(Boolean).length.toString()
      const rule = createRepetitionRule({ mode: 'count', stateKey: 'board', hashFn: customHash })
      const state = { board: ['a', 'b', null], _repetitionCounts: {} }
      const frag = rule.hooks.afterMove({}, state, {})
      expect(frag._repetitionCounts['2']).toBe(1)
    })
  })

  describe('composition', () => {
    it('works with composeRules', async () => {
      const { composeRules } = await import('../src/compose.js')
      const rule = createRepetitionRule({ mode: 'count', threshold: 3, stateKey: 'board' })
      const composed = composeRules([rule])

      const initState = composed.init({})
      expect(initState._repetitionCounts).toEqual({})

      const state = { board: ['X', null], _repetitionCounts: { 'X.': 2 } }
      const afterState = composed.afterMove({}, state, {})
      expect(afterState._repetitionCounts['X.']).toBe(3)

      const winCheck = composed.checkWin(afterState, {})
      expect(winCheck).toBe('draw')
    })
  })

  it('has correct metadata', () => {
    const rule = createRepetitionRule()
    expect(rule.id).toBe('repetition')
    expect(rule.category).toBe('constraint')
    expect(rule.requires).toEqual([])
  })
})
