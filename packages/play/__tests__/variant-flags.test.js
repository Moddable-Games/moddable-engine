import {
  parseVariantKey,
  serializeVariantKey,
  parseUrlFlags,
  deriveCompatibleFlags,
  applyFlags,
  flagPositionKeySuffix,
} from '../src/variant-flags.js'

describe('variant-flags', () => {
  describe('parseVariantKey', () => {
    test('base only', () => {
      expect(parseVariantKey('capablanca')).toEqual({ base: 'capablanca', flags: [] })
    })

    test('single flag', () => {
      expect(parseVariantKey('capablanca+drops')).toEqual({ base: 'capablanca', flags: ['drops'] })
    })

    test('multiple flags sorted', () => {
      expect(parseVariantKey('capablanca+random+drops')).toEqual({ base: 'capablanca', flags: ['drops', 'random'] })
    })

    test('empty string', () => {
      expect(parseVariantKey('')).toEqual({ base: '', flags: [] })
    })
  })

  describe('serializeVariantKey', () => {
    test('base only', () => {
      expect(serializeVariantKey('capablanca', [])).toBe('capablanca')
    })

    test('single flag', () => {
      expect(serializeVariantKey('capablanca', ['drops'])).toBe('capablanca+drops')
    })

    test('flags sorted regardless of input order', () => {
      expect(serializeVariantKey('capablanca', ['random', 'drops'])).toBe('capablanca+drops+random')
    })
  })

  describe('parseUrlFlags', () => {
    test('empty', () => {
      expect(parseUrlFlags('')).toEqual([])
    })

    test('single flag', () => {
      expect(parseUrlFlags('drops')).toEqual(['drops'])
    })

    test('multiple, sorted', () => {
      expect(parseUrlFlags('random,drops')).toEqual(['drops', 'random'])
    })

    test('ignores unknown flags', () => {
      expect(parseUrlFlags('drops,foo,random')).toEqual(['drops', 'random'])
    })
  })

  describe('deriveCompatibleFlags', () => {
    const standardDef = {
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        setup: { position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
        plugins: { chess: {} },
      },
    }

    test('standard chess supports both flags', () => {
      const flags = deriveCompatibleFlags(standardDef)
      expect(flags).toContain('random')
      expect(flags).toContain('drops')
    })

    test('antichess does not support drops', () => {
      const def = {
        engine: {
          topology: { type: 'grid', rows: 8, cols: 8 },
          setup: { position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
          plugins: { chess: { winCondition: 'antichess' } },
        },
      }
      const flags = deriveCompatibleFlags(def)
      expect(flags).not.toContain('drops')
      expect(flags).toContain('random')
    })

    test('variant with drops already enabled not re-flagged', () => {
      const def = {
        engine: {
          topology: { type: 'grid', rows: 8, cols: 8 },
          setup: { position: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
          plugins: { chess: { drops: true } },
        },
      }
      const flags = deriveCompatibleFlags(def)
      expect(flags).not.toContain('drops')
    })

    test('non-grid topology returns empty', () => {
      const def = {
        engine: {
          topology: { type: 'hex', radius: 5 },
          plugins: { hex: {} },
        },
      }
      expect(deriveCompatibleFlags(def)).toEqual([])
    })

    test('sparse back rank blocks random', () => {
      const def = {
        engine: {
          topology: { type: 'grid', rows: 8, cols: 8 },
          setup: { position: '8/8/8/8/8/8/pppppppp/4k3' },
          plugins: { chess: {} },
        },
      }
      const flags = deriveCompatibleFlags(def)
      expect(flags).not.toContain('random')
    })
  })

  describe('applyFlags', () => {
    const baseDef = {
      title: 'Capablanca',
      engine: { plugins: { chess: { size: 10 } } },
    }

    test('applies drops flag', () => {
      const result = applyFlags(baseDef, ['drops'])
      expect(result.engine.plugins.chess.drops).toBe(true)
      expect(result.engine.plugins.chess.size).toBe(10)
    })

    test('applies random flag', () => {
      const result = applyFlags(baseDef, ['random'])
      expect(result.engine.plugins.chess.randomSetup).toBe(true)
    })

    test('applies both flags', () => {
      const result = applyFlags(baseDef, ['drops', 'random'])
      expect(result.engine.plugins.chess.drops).toBe(true)
      expect(result.engine.plugins.chess.randomSetup).toBe(true)
    })

    test('does not mutate original', () => {
      applyFlags(baseDef, ['drops'])
      expect(baseDef.engine.plugins.chess.drops).toBeUndefined()
    })

    test('empty flags returns definition unchanged', () => {
      expect(applyFlags(baseDef, [])).toBe(baseDef)
    })
  })

  describe('flagPositionKeySuffix', () => {
    test('empty flags', () => {
      expect(flagPositionKeySuffix([])).toBe('')
    })

    test('single flag', () => {
      expect(flagPositionKeySuffix(['drops'])).toBe(' +drops')
    })

    test('multiple flags sorted', () => {
      expect(flagPositionKeySuffix(['random', 'drops'])).toBe(' +drops+random')
    })
  })
})
