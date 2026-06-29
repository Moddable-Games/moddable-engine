import { createStore } from '../src/state-store.js'

describe('state-store', () => {
  test('get returns initial slice state', () => {
    const store = createStore({ game: { board: [1, 2, 3] } })
    expect(store.get('game')).toEqual({ board: [1, 2, 3] })
  })

  test('set updates slice state', () => {
    const store = createStore({ game: { x: 1 } })
    store.set('game', { x: 2 })
    expect(store.get('game')).toEqual({ x: 2 })
  })

  test('getAll returns full state snapshot', () => {
    const store = createStore({ a: 1, b: 2 })
    expect(store.getAll()).toEqual({ a: 1, b: 2 })
  })

  test('fromSnapshot restores state', () => {
    const store = createStore({ a: 1 })
    store.set('a', 99)
    store.fromSnapshot({ a: 1 })
    expect(store.get('a')).toBe(1)
  })

  test('subscribe notifies on slice change', () => {
    const store = createStore({ x: 0 })
    const calls = []
    store.subscribe('x', (v) => calls.push(v))
    store.set('x', 5)
    expect(calls).toEqual([5])
  })

  test('subscribe returns unsubscribe', () => {
    const store = createStore({ x: 0 })
    const calls = []
    const unsub = store.subscribe('x', (v) => calls.push(v))
    unsub()
    store.set('x', 5)
    expect(calls).toEqual([])
  })

  test('claimSlice prevents double claim', () => {
    const store = createStore({ x: 0 })
    store.claimSlice('x', 'owner1')
    expect(() => store.claimSlice('x', 'owner2')).toThrow('already claimed')
  })

  test('set with wrong owner throws', () => {
    const store = createStore({ x: 0 })
    store.claimSlice('x', 'owner1')
    expect(() => store.set('x', 99, 'owner2')).toThrow('owned by')
  })

  test('set with correct owner succeeds', () => {
    const store = createStore({ x: 0 })
    store.claimSlice('x', 'owner1')
    store.set('x', 99, 'owner1')
    expect(store.get('x')).toBe(99)
  })

  test('JSON constraint throws for non-serialisable state', () => {
    const store = createStore({ x: 0 })
    const circular = {}
    circular.self = circular
    expect(() => store.set('x', circular)).toThrow('non-serialisable')
  })

  test('JSON constraint throws for function in state', () => {
    const store = createStore({ x: 0 })
    expect(() => store.set('x', { fn: () => {} })).toThrow('non-serialisable')
  })

  test('JSON constraint allows plain objects, arrays, primitives', () => {
    const store = createStore({ x: 0 })
    expect(() => store.set('x', { a: [1, 2], b: 'str', c: null, d: true })).not.toThrow()
  })
})
