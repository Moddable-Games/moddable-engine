import { createStore } from '../src/state-store.js'

// engine#155. A slice that holds something one seat knows and another does not
// cannot be read the same way by both, and the decision was that the boundary
// lives in the READ rather than in the shape of the slice - so that a consumer
// which forgets to filter gets nothing, instead of getting everything and being
// trusted not to look.

describe('a store with no secrets behaves exactly as before', () => {
  it('reads through unchanged', () => {
    const store = createStore({ board: { cells: [1, 2, 3] } })
    expect(store.hasSecrets()).toBe(false)
    expect(store.viewFor(0)).toEqual({ board: { cells: [1, 2, 3] } })
    expect(store.viewOf(1, 'board')).toEqual({ cells: [1, 2, 3] })
  })
})

describe('a declared secret is projected per seat', () => {
  function hands() {
    const store = createStore({ cards: { hands: [['As'], ['Kd']], discard: ['2c'] } })
    store.claimSlice('cards', 'deal')
    store.declareSecret('cards', (slice, seat) => ({
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h : h.length)),
    }), 'deal')
    return store
  }

  it('shows a seat its own hand and a count of everyone else', () => {
    const store = hands()
    expect(store.viewOf(0, 'cards').hands).toEqual([['As'], 1])
    expect(store.viewOf(1, 'cards').hands).toEqual([1, ['Kd']])
  })

  it('leaves what is public alone', () => {
    expect(hands().viewOf(0, 'cards').discard).toEqual(['2c'])
  })

  it('still returns the truth to an in-process read, because plugins need it', () => {
    const store = hands()
    expect(store.get('cards').hands).toEqual([['As'], ['Kd']])
    expect(store.getAll().cards.hands).toEqual([['As'], ['Kd']])
  })

  it('reports that it holds secrets, so a boundary can refuse to send getAll', () => {
    expect(hands().hasSecrets()).toBe(true)
  })

  it('projects every slice in a whole-store view', () => {
    const store = hands()
    store.set('turn', { player: 0 })
    expect(store.viewFor(1)).toEqual({
      cards: { hands: [1, ['Kd']], discard: ['2c'] },
      turn: { player: 0 },
    })
  })
})

describe('the ways this can be got wrong all throw', () => {
  it('a view with no viewer is the full state, so asking for one is refused', () => {
    const store = createStore({ cards: { hands: [['As'], ['Kd']] } })
    expect(() => store.viewFor()).toThrow(/needs a seat/)
    expect(() => store.viewOf(undefined, 'cards')).toThrow(/needs a seat/)
    expect(() => store.viewFor(null)).toThrow(/needs a seat/)
  })

  it('seat 0 is a seat, not a missing one', () => {
    const store = createStore({ cards: { hands: [['As']] } })
    expect(() => store.viewFor(0)).not.toThrow()
  })

  it('declaring a secret without saying how to hide it is refused', () => {
    const store = createStore({ cards: {} })
    expect(() => store.declareSecret('cards', null, 'deal'))
      .toThrow(/say how a seat sees it/)
  })

  it('only the owner may declare what its slice hides', () => {
    const store = createStore({ cards: {} })
    store.claimSlice('cards', 'deal')
    expect(() => store.declareSecret('cards', s => s, 'someone-else'))
      .toThrow(/owned by "deal"/)
  })

  it('a projection that returns something unserialisable is caught here, not on the wire', () => {
    const store = createStore({ cards: { hands: [[]] } })
    store.declareSecret('cards', () => ({ peek: () => 'As' }), undefined)
    expect(() => store.viewOf(0, 'cards')).toThrow(/non-serialisable/)
  })
})
