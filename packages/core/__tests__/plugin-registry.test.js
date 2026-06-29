import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'

describe('plugin-registry', () => {
  let registry

  beforeEach(() => { registry = createRegistry() })

  const mockPlugin = {
    sliceName: 'test',
    init: (config) => ({ count: config.start || 0 }),
    applyMove: (move, slice) => ({ count: slice.count + move.amount }),
    getLegalMoves: (slice) => [{ amount: 1 }],
    checkWin: () => null,
  }

  test('register accepts plugin with sliceName', () => {
    expect(() => registry.register(mockPlugin)).not.toThrow()
  })

  test('register throws without sliceName', () => {
    expect(() => registry.register({ init: () => {} })).toThrow('sliceName')
  })

  test('provide + request returns capability', () => {
    const fn = (x) => x * 2
    registry.provide('math.double', fn)
    expect(registry.request('math.double')).toBe(fn)
  })

  test('request returns null for unregistered capability', () => {
    expect(registry.request('nonexistent')).toBeNull()
  })

  test('initAll initializes all plugins', () => {
    registry.register(mockPlugin)
    const store = createStore({})
    registry.initAll({ test: { start: 5 } }, store)
    expect(store.get('test')).toEqual({ count: 5 })
  })

  test('initAll claims slice ownership', () => {
    registry.register(mockPlugin)
    const store = createStore({})
    registry.initAll({}, store)
    expect(() => store.set('test', { count: 99 }, 'intruder')).toThrow('owned by')
  })

  test('call invokes method on all plugins that have it', () => {
    registry.register(mockPlugin)
    registry.register({
      sliceName: 'other',
      init: () => ({}),
      checkWin: () => 'winner!',
    })
    const results = registry.call('checkWin', {}, {})
    expect(results).toEqual([null, 'winner!'])
  })

  test('call skips plugins without the method', () => {
    registry.register({ sliceName: 'minimal', init: () => ({}) })
    const results = registry.call('getLegalMoves', {}, {})
    expect(results).toEqual([])
  })

  test('getPlugins returns copy of registered plugins', () => {
    registry.register(mockPlugin)
    const plugins = registry.getPlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].sliceName).toBe('test')
  })
})
