import { registerVariant, getVariantConfig, getAllVariants, getVariantGroups } from '../index.js'
import { standard, noCastling, torpedo, threeCheck, fiveCheck, kingOfTheHill, antichess, racingKings } from '../src/variants/index.js'

describe('variant-registry', () => {
  beforeAll(() => {
    registerVariant('standard', standard)
    registerVariant('noCastling', noCastling)
    registerVariant('torpedo', torpedo)
    registerVariant('threeCheck', threeCheck)
    registerVariant('fiveCheck', fiveCheck)
    registerVariant('kingOfTheHill', kingOfTheHill)
    registerVariant('antichess', antichess)
    registerVariant('racingKings', racingKings)
  })

  it('retrieves registered variants', () => {
    const config = getVariantConfig('standard')
    expect(config).not.toBeNull()
    expect(config.label).toBe('Standard')
    expect(config.group).toBe('Classic')
  })

  it('returns null for unknown variants', () => {
    expect(getVariantConfig('nonexistent')).toBeNull()
  })

  it('lists all registered variant keys', () => {
    const keys = getAllVariants()
    expect(keys).toContain('standard')
    expect(keys).toContain('antichess')
    expect(keys).toContain('racingKings')
    expect(keys.length).toBe(8)
  })

  it('groups variants by category', () => {
    const groups = getVariantGroups()
    expect(groups.has('Classic')).toBe(true)
    expect(groups.has('Tactical')).toBe(true)
    expect(groups.has('Alternate Rules')).toBe(true)
    const classic = groups.get('Classic')
    expect(classic.find(v => v.key === 'standard')).toBeDefined()
    expect(classic.find(v => v.key === 'noCastling')).toBeDefined()
  })

  describe('config-only variants', () => {
    it('noCastling disables castling', () => {
      const config = getVariantConfig('noCastling')
      expect(config.castling).toBe(false)
    })

    it('torpedo enables torpedo pawns', () => {
      const config = getVariantConfig('torpedo')
      expect(config.torpedo).toBe(true)
    })
  })

  describe('hook-based variants', () => {
    it('threeCheck has winCondition hook', () => {
      const config = getVariantConfig('threeCheck')
      expect(typeof config.winCondition).toBe('function')
    })

    it('threeCheck winCondition triggers at 3 checks', () => {
      const config = getVariantConfig('threeCheck')
      const result = config.winCondition({ checkCount: { 0: 3, 1: 1 } }, { currentPlayer: 0 })
      expect(result).toBe('white')
    })

    it('threeCheck winCondition returns null below threshold', () => {
      const config = getVariantConfig('threeCheck')
      const result = config.winCondition({ checkCount: { 0: 2, 1: 1 } }, { currentPlayer: 0 })
      expect(result).toBeNull()
    })

    it('kingOfTheHill winCondition detects king on centre', () => {
      const config = getVariantConfig('kingOfTheHill')
      const board = new Array(64).fill(null)
      board[27] = { type: 'king', owner: 0 }
      board[63] = { type: 'king', owner: 1 }
      const result = config.winCondition({ board }, { currentPlayer: 1 })
      expect(result).toBe('white')
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

    it('racingKings has custom setup', () => {
      const config = getVariantConfig('racingKings')
      expect(config.setup).toBe('8/8/8/8/8/8/krbnNBRK/qrbnNBRQ')
      expect(config.castling).toBe(false)
    })
  })
})
