import '../../../play/src/bootstrap-plugins.js'
import { getVariantConfig } from '../../../play/src/variant-registry.js'

describe('variant-registry (chess variants via play registry)', () => {
  it('retrieves registered variants', () => {
    const config = getVariantConfig('chess', 'threeCheck')
    expect(config).not.toBeNull()
    expect(config.key).toBe('threeCheck')
  })

  it('returns null for unknown variants', () => {
    expect(getVariantConfig('chess', 'nonexistent')).toBeNull()
  })

  describe('hook-based variants', () => {
    it('threeCheck has winCondition hook', () => {
      const config = getVariantConfig('chess', 'threeCheck')
      expect(typeof config.winCondition).toBe('function')
    })

    it('threeCheck winCondition triggers at 3 checks', () => {
      const config = getVariantConfig('chess', 'threeCheck')
      const result = config.winCondition({ checkCount: { 0: 3, 1: 1 } }, { currentPlayer: 0 })
      expect(result).toBe(0)
    })

    it('kingOfTheHill winCondition detects king on centre', () => {
      const config = getVariantConfig('chess', 'kingOfTheHill')
      const board = new Array(64).fill(null)
      board[27] = { type: 'king', owner: 0 }
      board[63] = { type: 'king', owner: 1 }
      const result = config.winCondition({ board }, { currentPlayer: 1 })
      expect(result).toBe(0)
    })

    it('antichess moveFilter forces captures', () => {
      const config = getVariantConfig('chess', 'antichess')
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
      const config = getVariantConfig('chess', 'racingKings')
      expect(typeof config.moveFilter).toBe('function')
      expect(typeof config.winCondition).toBe('function')
    })
  })
})
