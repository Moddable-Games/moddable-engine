import { createPlayerSystem } from '../src/player-system.js'
import { createStore } from '../src/state-store.js'

describe('player-system', () => {
  let ps, store

  beforeEach(() => {
    ps = createPlayerSystem({ players: ['white', 'black'] })
    store = createStore({ [ps.sliceName]: ps.initState() })
  })

  test('current returns first player initially', () => {
    expect(ps.current(store)).toBe('white')
  })

  test('advance cycles to next player', () => {
    ps.advance(store)
    expect(ps.current(store)).toBe('black')
  })

  test('advance wraps around', () => {
    ps.advance(store)
    ps.advance(store)
    expect(ps.current(store)).toBe('white')
  })

  test('4-player rotation', () => {
    const ps4 = createPlayerSystem({ players: ['a', 'b', 'c', 'd'] })
    const s4 = createStore({ [ps4.sliceName]: ps4.initState() })
    expect(ps4.current(s4)).toBe('a')
    ps4.advance(s4)
    expect(ps4.current(s4)).toBe('b')
    ps4.advance(s4)
    expect(ps4.current(s4)).toBe('c')
    ps4.advance(s4)
    expect(ps4.current(s4)).toBe('d')
    ps4.advance(s4)
    expect(ps4.current(s4)).toBe('a')
  })

  test('pass advances but increments passCount', () => {
    ps.pass(store)
    expect(ps.current(store)).toBe('black')
    expect(ps.getPassCount(store)).toBe(1)
  })

  test('advance resets passCount', () => {
    ps.pass(store)
    ps.advance(store)
    expect(ps.getPassCount(store)).toBe(0)
  })

  test('forceTurn sets specific player', () => {
    ps.forceTurn('black', store)
    expect(ps.current(store)).toBe('black')
  })

  test('forceTurn throws for unknown player', () => {
    expect(() => ps.forceTurn('red', store)).toThrow('Unknown player')
  })

  test('isCurrentPlayer checks correctly', () => {
    expect(ps.isCurrentPlayer('white', store)).toBe(true)
    expect(ps.isCurrentPlayer('black', store)).toBe(false)
  })

  test('getAll returns player list', () => {
    expect(ps.getAll()).toEqual(['white', 'black'])
  })

  test('getPlayerCount returns count', () => {
    expect(ps.getPlayerCount()).toBe(2)
  })

  test('getCurrentIndex returns numeric index', () => {
    expect(ps.getCurrentIndex(store)).toBe(0)
    ps.advance(store)
    expect(ps.getCurrentIndex(store)).toBe(1)
  })
})
