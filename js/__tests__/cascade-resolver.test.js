import { resolve, deepMerge, deriveDefaults, validate } from '../cascade-resolver.js'

describe('deepMerge', () => {
  test('scalars — rightmost wins', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 })
  })

  test('nested objects merge recursively', () => {
    const base = { render: { cellSize: 40, labels: true } }
    const override = { render: { cellSize: 36 } }
    expect(deepMerge(base, override)).toEqual({ render: { cellSize: 36, labels: true } })
  })

  test('arrays replace (not concatenate)', () => {
    const base = { players: ['white', 'black'] }
    const override = { players: ['red', 'blue', 'green'] }
    expect(deepMerge(base, override)).toEqual({ players: ['red', 'blue', 'green'] })
  })

  test('undefined in override does not clobber base', () => {
    const base = { a: 1, b: 2 }
    const override = { a: undefined }
    expect(deepMerge(base, override)).toEqual({ a: 1, b: 2 })
  })

  test('new keys from override are added', () => {
    const base = { a: 1 }
    const override = { b: 2 }
    expect(deepMerge(base, override)).toEqual({ a: 1, b: 2 })
  })

  test('deeply nested merge', () => {
    const base = { surface: { colors: { 'cell-light': '#f0d9b5', stroke: '#000' } } }
    const override = { surface: { colors: { 'cell-light': '#e6a817' } } }
    expect(deepMerge(base, override)).toEqual({
      surface: { colors: { 'cell-light': '#e6a817', stroke: '#000' } },
    })
  })
})

describe('resolve — cascade', () => {
  test('chess standard — surface + family + setup-only variant', () => {
    const surface = {
      colors: { 'cell-light': '#f0d9b5', 'cell-dark': '#b58863', stroke: 'rgba(0,0,0,0.1)' },
      texture: 'grain',
      gridLine: 'thin',
    }
    const family = {
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        surface: 'wood-classic', // string ref — pre-resolved by surface-resolver
        render: { cellSize: 40, cellColor: 'checkered' },
        pieces: { set: 'mce-fairy-complete' },
        players: ['white', 'black'],
      },
      meta: { label: 'Chess', category: 'board', tags: ['abstract', 'combinatorial'] },
    }
    const variant = {
      engine: { setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      meta: { label: 'Standard', description: 'Standard FIDE rules.', tags: ['classic'] },
    }

    const { resolved, errors } = resolve({ surface, family, variant })

    expect(errors).toEqual([])
    expect(resolved.topology).toEqual({ type: 'grid', rows: 8, cols: 8 })
    expect(resolved.render.cellSize).toBe(40)
    expect(resolved.render.cellColor).toBe('checkered')
    expect(resolved.setup).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
    expect(resolved.meta.label).toBe('Standard')
    expect(resolved.meta.category).toBe('board')
    // Tags concatenate
    expect(resolved.meta.tags).toEqual(['abstract', 'combinatorial', 'classic'])
  })

  test('Capablanca — variant overrides cols + cellSize', () => {
    const surface = { colors: { 'cell-light': '#f0d9b5', 'cell-dark': '#b58863' } }
    const family = {
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        render: { cellSize: 40, cellColor: 'checkered' },
        players: ['white', 'black'],
      },
      meta: { label: 'Chess', tags: ['abstract'] },
    }
    const variant = {
      engine: {
        topology: { cols: 10 },
        render: { cellSize: 36 },
        setup: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR',
      },
      meta: { label: 'Capablanca', tags: ['large-board', 'fairy'] },
    }

    const { resolved, errors } = resolve({ surface, family, variant })

    expect(errors).toEqual([])
    expect(resolved.topology.rows).toBe(8) // inherited
    expect(resolved.topology.cols).toBe(10) // overridden
    expect(resolved.render.cellSize).toBe(36) // overridden
    expect(resolved.render.cellColor).toBe('checkered') // inherited
    expect(resolved.meta.tags).toEqual(['abstract', 'large-board', 'fairy'])
  })

  test('Glinski — entirely different topology', () => {
    const surface = { colors: { 'cell-light': '#f0d9b5', 'cell-dark': '#b58863' } }
    const family = {
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        render: { cellSize: 40, cellColor: 'checkered' },
      },
      meta: { label: 'Chess', tags: ['abstract'] },
    }
    const variant = {
      engine: {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5, orientation: 'flat' },
        surface: { colors: { 'cell-mid': '#e8ab6f' } },
        render: { cellSize: 22, cellColor: 'tricolor' },
        setup: { '1,4': 'K', '-1,5': 'Q' },
      },
      meta: { label: 'Glinski', tags: ['hex'] },
    }

    const { resolved, errors } = resolve({ surface, family, variant })

    expect(errors).toEqual([])
    expect(resolved.topology.type).toBe('hex')
    expect(resolved.topology.radius).toBe(5)
    // Surface merges (variant adds cell-mid on top of base)
    expect(resolved.surface.colors['cell-light']).toBe('#f0d9b5')
    expect(resolved.surface.colors['cell-mid']).toBe('#e8ab6f')
    expect(resolved.render.cellColor).toBe('tricolor')
  })

  test('card game — no topology, deck component', () => {
    const surface = { colors: { background: '#1a3a1a' }, texture: 'felt' }
    const family = {
      engine: {
        topology: { type: 'none' },
        components: { deck: { type: 'standard-52' } },
      },
      meta: { label: '52 Cards', tags: ['cards'] },
    }
    const variant = {
      engine: {
        setup: { deal: 2, community: 5, players: 6 },
        components: {
          layout: { zones: [{ name: 'hand', type: 'fan', per: 'player' }] },
        },
      },
      meta: { label: "Texas Hold'em", tags: ['betting'] },
    }

    const { resolved, errors } = resolve({ surface, family, variant })

    expect(errors).toEqual([])
    expect(resolved.meta.category).toBe('card')
    expect(resolved.components.deck.type).toBe('standard-52')
    expect(resolved.components.layout.zones[0].name).toBe('hand')
    expect(resolved.meta.tags).toEqual(['cards', 'betting'])
  })
})

describe('resolve — default derivation', () => {
  test('grid → checkered, labels true', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'grid', rows: 8, cols: 8 } }, meta: { label: 'Test' } },
      variant: { engine: { setup: 'x' }, meta: {} },
    })
    expect(resolved.render.cellColor).toBe('checkered')
    expect(resolved.render.labels).toBe(true)
  })

  test('hex → uniform, labels false', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'hex', radius: 5 } }, meta: { label: 'Test' } },
      variant: { engine: { setup: {} }, meta: {} },
    })
    expect(resolved.render.cellColor).toBe('uniform')
    expect(resolved.render.labels).toBe(false)
  })

  test('frame derived from topology.shape', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'hex', shape: 'rhombus' } }, meta: { label: 'Test' } },
      variant: { engine: { setup: {} }, meta: {} },
    })
    expect(resolved.render.frame).toBe('rhombus')
  })

  test('explicit cellColor not overwritten by derivation', () => {
    const { resolved } = resolve({
      surface: {},
      family: {
        engine: { topology: { type: 'grid', rows: 8, cols: 8 }, render: { cellColor: 'uniform' } },
        meta: { label: 'Test' },
      },
      variant: { engine: { setup: 'x' }, meta: {} },
    })
    expect(resolved.render.cellColor).toBe('uniform')
  })

  test('no topology + deck → category card', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'none' }, components: { deck: { type: 'standard-52' } } }, meta: { label: 'Cards' } },
      variant: { engine: {}, meta: {} },
    })
    expect(resolved.meta.category).toBe('card')
  })

  test('no topology + dice → category dice', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'none' }, components: { dice: { count: 5 } } }, meta: { label: 'Dice' } },
      variant: { engine: {}, meta: {} },
    })
    expect(resolved.meta.category).toBe('dice')
  })

  test('no topology + nothing → category rpg', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'none' } }, meta: { label: 'RPG' } },
      variant: { engine: {}, meta: {} },
    })
    expect(resolved.meta.category).toBe('rpg')
  })
})

describe('resolve — validation', () => {
  test('board game without topology.type fails', () => {
    const { errors } = resolve({
      surface: {},
      family: { engine: { topology: {} }, meta: { label: 'Bad', category: 'board' } },
      variant: { engine: { setup: 'x' }, meta: {} },
    })
    expect(errors).toContain('Board games require topology.type')
  })

  test('board game without setup passes (empty board is valid)', () => {
    const { errors } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'grid', rows: 8, cols: 8 } }, meta: { label: 'Go' } },
      variant: { engine: {}, meta: {} },
    })
    expect(errors).toEqual([])
  })

  test('component game without deck/dice/tiles fails', () => {
    // Explicitly set category to card — derivation would pick rpg for empty components
    const { errors } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'none' }, components: {} }, meta: { label: 'Bad', category: 'card' } },
      variant: { engine: {}, meta: {} },
    })
    expect(errors).toContain('Component games require components.deck, components.dice, or components.tiles')
  })

  test('missing meta.label fails', () => {
    const { errors } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'grid', rows: 8, cols: 8 } }, meta: {} },
      variant: { engine: { setup: 'x' }, meta: {} },
    })
    expect(errors).toContain('meta.label must resolve (explicit or derived)')
  })

  test('valid definition passes all checks', () => {
    const { errors } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'grid', rows: 8, cols: 8 } }, meta: { label: 'Chess' } },
      variant: { engine: { setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' }, meta: {} },
    })
    expect(errors).toEqual([])
  })
})

describe('resolve — surface cascade', () => {
  test('surface colours merge through all three levels', () => {
    const surface = { colors: { 'cell-light': '#aaa', 'cell-dark': '#333', stroke: '#000' } }
    const family = {
      engine: { topology: { type: 'grid', rows: 8, cols: 8 }, surface: { colors: { throne: '#8b4513' } } },
      meta: { label: 'Tafl' },
    }
    const variant = {
      engine: { setup: 'x', surface: { colors: { corner: '#2e7d32' } } },
      meta: {},
    }

    const { resolved } = resolve({ surface, family, variant })

    expect(resolved.surface.colors['cell-light']).toBe('#aaa')
    expect(resolved.surface.colors.throne).toBe('#8b4513')
    expect(resolved.surface.colors.corner).toBe('#2e7d32')
    expect(resolved.surface.colors.stroke).toBe('#000')
  })

  test('variant surface colour overrides family surface colour', () => {
    const surface = { colors: { 'cell-light': '#f0d9b5' } }
    const family = {
      engine: { topology: { type: 'grid', rows: 8, cols: 8 }, surface: { colors: { 'cell-light': '#dcb35c' } } },
      meta: { label: 'Test' },
    }
    const variant = {
      engine: { setup: 'x', surface: { colors: { 'cell-light': '#e6a817' } } },
      meta: {},
    }

    const { resolved } = resolve({ surface, family, variant })
    expect(resolved.surface.colors['cell-light']).toBe('#e6a817')
  })

  test('family with string surface ref — surface object passed pre-resolved', () => {
    // The surface-resolver will have already resolved the string to an object
    // before cascade-resolver receives it. So cascade just uses the object.
    const surface = { colors: { 'cell-light': '#f0d9b5' }, texture: 'grain' }
    const family = {
      engine: { topology: { type: 'grid', rows: 8, cols: 8 } },
      meta: { label: 'Chess' },
    }
    const variant = {
      engine: { setup: 'x' },
      meta: {},
    }

    const { resolved } = resolve({ surface, family, variant })
    expect(resolved.surface.texture).toBe('grain')
    expect(resolved.surface.colors['cell-light']).toBe('#f0d9b5')
  })
})

describe('resolve — meta.tags concatenation', () => {
  test('variant tags append to family tags', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'grid', rows: 8, cols: 8 } }, meta: { label: 'Chess', tags: ['abstract', 'combinatorial'] } },
      variant: { engine: { setup: 'x' }, meta: { tags: ['large-board', 'fairy'] } },
    })
    expect(resolved.meta.tags).toEqual(['abstract', 'combinatorial', 'large-board', 'fairy'])
  })

  test('empty family tags + variant tags', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'grid', rows: 8, cols: 8 } }, meta: { label: 'Chess' } },
      variant: { engine: { setup: 'x' }, meta: { tags: ['modern'] } },
    })
    expect(resolved.meta.tags).toEqual(['modern'])
  })

  test('family tags + empty variant tags', () => {
    const { resolved } = resolve({
      surface: {},
      family: { engine: { topology: { type: 'grid', rows: 8, cols: 8 } }, meta: { label: 'Chess', tags: ['abstract'] } },
      variant: { engine: { setup: 'x' }, meta: {} },
    })
    expect(resolved.meta.tags).toEqual(['abstract'])
  })
})
