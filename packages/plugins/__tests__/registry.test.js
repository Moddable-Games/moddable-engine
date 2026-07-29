import { register, get, has, getAll, getIds, createFactory, clear } from '../registry.js'

describe('plugin registry', () => {
  beforeEach(() => clear())

  test('register and retrieve a plugin', () => {
    const factory = (cfg) => ({ sliceName: 'test', init: () => ({}) })
    register('test', { factory })
    expect(has('test')).toBe(true)
    expect(get('test').factory).toBe(factory)
  })

  test('get returns null for unknown plugin', () => {
    expect(get('unknown')).toBe(null)
    expect(has('unknown')).toBe(false)
  })

  test('register requires id', () => {
    expect(() => register('', { factory: () => {} })).toThrow('id is required')
  })

  test('register requires factory function', () => {
    expect(() => register('bad', {})).toThrow('must have a factory')
    expect(() => register('bad', { factory: 'not a fn' })).toThrow('must have a factory')
  })

  test('getAll returns all registered plugins', () => {
    register('a', { factory: () => {} })
    register('b', { factory: () => {} })
    const all = getAll()
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe('a')
    expect(all[1].id).toBe('b')
  })

  test('getIds returns registered ids', () => {
    register('x', { factory: () => {} })
    register('y', { factory: () => {} })
    expect(getIds()).toEqual(['x', 'y'])
  })

  test('createFactory returns the factory function', () => {
    const fn = () => {}
    register('chess', { factory: fn })
    expect(createFactory('chess')).toBe(fn)
  })

  test('createFactory throws for unknown plugin', () => {
    expect(() => createFactory('nope')).toThrow('Unknown plugin')
  })

  test('clear empties the registry', () => {
    register('a', { factory: () => {} })
    clear()
    expect(getIds()).toEqual([])
  })
})

describe('plugin index — built-in registration', () => {
  // Import index.js which triggers side-effect registration
  beforeAll(async () => { await import('../index.js') })

  test('all 5 built-in plugins are registered', () => {
    const ids = getIds()
    expect(ids).toContain('chess')
    expect(ids).toContain('go')
    expect(ids).toContain('draughts')
    expect(ids).toContain('shogi')
    expect(ids).toContain('xiangqi')
    expect(ids.length).toBeGreaterThanOrEqual(5)
  })

  test('each registered factory is callable', () => {
    for (const id of getIds()) {
      const factory = createFactory(id)
      expect(typeof factory).toBe('function')
    }
  })

  test('runtime registration works alongside built-ins', () => {
    register('custom', { factory: (cfg) => ({ sliceName: 'custom', init: () => ({}) }) })
    expect(has('custom')).toBe(true)
    expect(getIds()).toContain('custom')
  })
})
