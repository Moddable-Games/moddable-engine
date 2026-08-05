import { registerVariant, getVariantConfig, getAllVariants, getVariantGroups } from '../index.js'
import { threeCheck, fiveCheck, kingOfTheHill, antichess, racingKings } from '../src/variants/index.js'

describe('variant-registry', () => {
  beforeAll(() => {
    registerVariant('standard', { key: 'standard' })
    registerVariant('threeCheck', threeCheck)
    registerVariant('fiveCheck', fiveCheck)
    registerVariant('kingOfTheHill', kingOfTheHill)
    registerVariant('antichess', antichess)
    registerVariant('racingKings', racingKings)
  })

  it('retrieves registered variants', () => {
    const config = getVariantConfig('standard')
    expect(config).not.toBeNull()
    expect(config.key).toBe('standard')
  })

  it('returns null for unknown variants', () => {
    expect(getVariantConfig('nonexistent')).toBeNull()
  })

  it('lists all registered variant keys', () => {
    const keys = getAllVariants()
    expect(keys).toContain('standard')
    expect(keys).toContain('antichess')
    expect(keys).toContain('racingKings')
    expect(keys.length).toBeGreaterThanOrEqual(6)
  })

  describe('hook-based variants', () => {
    it('threeCheck has winCondition hook', () => {
      const config = getVariantConfig('threeCheck')
      expect(typeof config.winCondition).toBe('function')
    })

    it('threeCheck winCondition triggers at 3 checks', () => {
      const config = getVariantConfig('threeCheck')
      const result = config.winCondition({ checkCount: { 0: 3, 1: 1 } }, { currentPlayer: 0 })
      expect(result).toBe(0)
    })

    it('kingOfTheHill winCondition detects king on centre', () => {
      const config = getVariantConfig('kingOfTheHill')
      const board = new Array(64).fill(null)
      board[27] = { type: 'king', owner: 0 }
      board[63] = { type: 'king', owner: 1 }
      const result = config.winCondition({ board }, { currentPlayer: 1 })
      expect(result).toBe(0)
    })

    it('antichess moveFilter forces captures', () => {
      const config = getVariantConfig('antichess')
      const board = new Array(64).fill(null)
      board[52] = { type: 'pawn', owner: 0 }
      board[43] = { type: 'pawn', owner: 1 }
      const moves = [
        { from: 52, to: 44 },
        { from: 52, to: 36 },
        { from: 52, to: 43 },
      ]
      const filtered = config.moveFilter(moves, { board }, { currentPlayer: 0 })
      expect(filtered.length).toBe(1)
      expect(filtered[0].to).toBe(43)
    })

    it('racingKings has moveFilter and winCondition', () => {
      const config = getVariantConfig('racingKings')
      expect(typeof config.moveFilter).toBe('function')
      expect(typeof config.winCondition).toBe('function')
    })
  })
})
