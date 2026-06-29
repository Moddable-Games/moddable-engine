import { createHistory } from '../src/history.js'
import { createStore } from '../src/state-store.js'

describe('history', () => {
  let history, store

  beforeEach(() => {
    history = createHistory()
    store = createStore({ game: { value: 0 } })
  })

  test('starts empty', () => {
    expect(history.length()).toBe(0)
    expect(history.getCurrent()).toBeNull()
  })

  test('record adds entry', () => {
    const before = store.getAll()
    store.set('game', { value: 1 })
    const after = store.getAll()
    history.record({ type: 'inc' }, before, after)
    expect(history.length()).toBe(1)
    expect(history.getCurrent().move).toEqual({ type: 'inc' })
  })

  test('undo restores previous state', () => {
    const before = store.getAll()
    store.set('game', { value: 1 })
    const after = store.getAll()
    history.record({ type: 'inc' }, before, after)

    const move = history.undo(store)
    expect(move).toEqual({ type: 'inc' })
    expect(store.get('game')).toEqual({ value: 0 })
  })

  test('redo restores forward state', () => {
    const before = store.getAll()
    store.set('game', { value: 1 })
    const after = store.getAll()
    history.record({ type: 'inc' }, before, after)

    history.undo(store)
    const move = history.redo(store)
    expect(move).toEqual({ type: 'inc' })
    expect(store.get('game')).toEqual({ value: 1 })
  })

  test('undo returns null when at start', () => {
    expect(history.undo(store)).toBeNull()
  })

  test('redo returns null when at end', () => {
    expect(history.redo(store)).toBeNull()
  })

  test('toJSON/fromJSON round-trip', () => {
    const before = store.getAll()
    store.set('game', { value: 1 })
    const after = store.getAll()
    history.record({ type: 'inc' }, before, after)

    const json = history.toJSON()
    const history2 = createHistory()
    const store2 = createStore({ game: { value: 0 } })
    history2.fromJSON(json, store2)

    expect(history2.length()).toBe(1)
    expect(history2.getCurrent().move).toEqual({ type: 'inc' })
    expect(store2.get('game')).toEqual({ value: 1 })
  })

  test('new record after undo discards forward history', () => {
    const s0 = store.getAll()
    store.set('game', { value: 1 })
    history.record({ n: 1 }, s0, store.getAll())

    const s1 = store.getAll()
    store.set('game', { value: 2 })
    history.record({ n: 2 }, s1, store.getAll())

    history.undo(store)
    const s1b = store.getAll()
    store.set('game', { value: 99 })
    history.record({ n: 99 }, s1b, store.getAll())

    expect(history.length()).toBe(2)
    expect(history.getCurrent().move).toEqual({ n: 99 })
  })

  test('getEntries returns copy', () => {
    const before = store.getAll()
    store.set('game', { value: 1 })
    history.record({ x: 1 }, before, store.getAll())
    const entries = history.getEntries()
    entries.pop()
    expect(history.length()).toBe(1)
  })
})
