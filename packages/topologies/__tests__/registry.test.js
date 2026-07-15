import { register, get, has, create, getAll, getTypes, clear } from '../registry.js'

describe('topology registry', () => {
  beforeEach(() => clear())

  test('register and retrieve a topology', () => {
    const factory = (cfg) => ({ type: 'custom', cells: [] })
    register('custom', { factory, schema: { type: 'custom', required: [] } })
    expect(has('custom')).toBe(true)
    expect(get('custom').factory).toBe(factory)
    expect(get('custom').schema.type).toBe('custom')
  })

  test('get returns null for unknown type', () => {
    expect(get('unknown')).toBe(null)
    expect(has('unknown')).toBe(false)
  })

  test('create instantiates a topology from config', () => {
    const factory = (cfg) => ({ type: 'grid', rows: cfg.rows })
    register('grid', { factory })
    const topo = create({ type: 'grid', rows: 8 })
    expect(topo.rows).toBe(8)
  })

  test('create throws for unknown type', () => {
    expect(() => create({ type: 'nope' })).toThrow('No topology registered')
  })

  test('create returns null for missing config', () => {
    expect(create(null)).toBe(null)
    expect(create({})).toBe(null)
  })

  test('register requires type', () => {
    expect(() => register('', { factory: () => {} })).toThrow('type is required')
  })

  test('register requires factory function', () => {
    expect(() => register('bad', {})).toThrow('must have a factory')
  })

  test('getTypes returns registered types', () => {
    register('a', { factory: () => {} })
    register('b', { factory: () => {} })
    expect(getTypes()).toEqual(['a', 'b'])
  })
})

describe('topology index — built-in registration', () => {
  beforeAll(async () => {
    clear()
    await import('../index.js')
  })

  test('all 5 built-in topologies are registered', () => {
    const types = getTypes()
    expect(types).toContain('grid')
    expect(types).toContain('hex')
    expect(types).toContain('track')
    expect(types).toContain('pit')
    expect(types).toContain('graph')
    expect(types.length).toBeGreaterThanOrEqual(5)
  })

  test('each registered topology has a schema', () => {
    for (const { type, schema } of getAll()) {
      expect(schema).toBeDefined()
      expect(schema.type).toBe(type)
    }
  })

  test('create works for each registered type', () => {
    const grid = create({ type: 'grid', rows: 4, cols: 4 })
    expect(grid).toBeDefined()
    const hex = create({ type: 'hex', radius: 3 })
    expect(hex).toBeDefined()
  })

  test('runtime registration works alongside built-ins', () => {
    register('triangular', { factory: (cfg) => ({ type: 'triangular' }), schema: { type: 'triangular', required: [] } })
    expect(has('triangular')).toBe(true)
    expect(getTypes()).toContain('triangular')
  })
})
