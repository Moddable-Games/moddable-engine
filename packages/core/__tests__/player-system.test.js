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

  describe('elimination', () => {
    let ps4, s4

    beforeEach(() => {
      ps4 = createPlayerSystem({ players: ['a', 'b', 'c', 'd'] })
      s4 = createStore({ [ps4.sliceName]: ps4.initState() })
    })

    test('getActiveCount returns total when none eliminated', () => {
      expect(ps4.getActiveCount(s4)).toBe(4)
    })

    test('eliminate reduces active count', () => {
      ps4.eliminate(1, s4)
      expect(ps4.getActiveCount(s4)).toBe(3)
    })

    test('isEliminated reports correctly', () => {
      expect(ps4.isEliminated(1, s4)).toBe(false)
      ps4.eliminate(1, s4)
      expect(ps4.isEliminated(1, s4)).toBe(true)
    })

    test('double eliminate is idempotent', () => {
      ps4.eliminate(1, s4)
      ps4.eliminate(1, s4)
      expect(ps4.getActiveCount(s4)).toBe(3)
    })

    test('advance skips eliminated seat', () => {
      ps4.eliminate(1, s4)
      ps4.advance(s4)
      expect(ps4.current(s4)).toBe('c')
    })

    test('advance skips multiple eliminated seats', () => {
      ps4.eliminate(1, s4)
      ps4.eliminate(2, s4)
      ps4.advance(s4)
      expect(ps4.current(s4)).toBe('d')
    })

    test('advance wraps around skipping eliminated', () => {
      ps4.eliminate(3, s4)
      ps4.forceTurn('c', s4)
      ps4.advance(s4)
      expect(ps4.current(s4)).toBe('a')
    })

    test('pass skips eliminated seat', () => {
      ps4.eliminate(1, s4)
      ps4.pass(s4)
      expect(ps4.current(s4)).toBe('c')
      expect(ps4.getPassCount(s4)).toBe(1)
    })

    test('three-player elimination leaves last active', () => {
      ps4.eliminate(0, s4)
      ps4.eliminate(2, s4)
      ps4.eliminate(3, s4)
      expect(ps4.getActiveCount(s4)).toBe(1)
    })
  })
})
