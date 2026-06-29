import { createPitTopology } from '../src/topology-pit.js'

describe('topology-pit', () => {
  describe('standard oware (6 pits per side, 2 players, stores)', () => {
    const pit = createPitTopology({ pitsPerSide: 6, players: 2, hasStores: true })

    test('total positions: 12 pits + 2 stores = 14', () => {
      expect(pit.getCount()).toBe(14)
    })

    test('totalPits is 12', () => {
      expect(pit.getTotalPits()).toBe(12)
    })

    test('pitIndex maps player+pit to index', () => {
      expect(pit.pitIndex(0, 0)).toBe(0)
      expect(pit.pitIndex(0, 5)).toBe(5)
      expect(pit.pitIndex(1, 0)).toBe(6)
      expect(pit.pitIndex(1, 5)).toBe(11)
    })

    test('storeIndex returns store position', () => {
      expect(pit.storeIndex(0)).toBe(12)
      expect(pit.storeIndex(1)).toBe(13)
    })

    test('getOwner identifies pit ownership', () => {
      expect(pit.getOwner(0)).toBe(0)
      expect(pit.getOwner(5)).toBe(0)
      expect(pit.getOwner(6)).toBe(1)
      expect(pit.getOwner(11)).toBe(1)
    })

    test('getOwner identifies store ownership', () => {
      expect(pit.getOwner(12)).toBe(0)
      expect(pit.getOwner(13)).toBe(1)
    })

    test('isStore / isPit correctly classify', () => {
      expect(pit.isPit(0)).toBe(true)
      expect(pit.isPit(11)).toBe(true)
      expect(pit.isPit(12)).toBe(false)
      expect(pit.isStore(12)).toBe(true)
      expect(pit.isStore(0)).toBe(false)
    })

    test('isValid covers all positions', () => {
      for (let i = 0; i < 14; i++) expect(pit.isValid(i)).toBe(true)
      expect(pit.isValid(14)).toBe(false)
      expect(pit.isValid(-1)).toBe(false)
    })

    test('getOpposite returns mirror pit', () => {
      expect(pit.getOpposite(0)).toBe(11)
      expect(pit.getOpposite(5)).toBe(6)
      expect(pit.getOpposite(3)).toBe(8)
    })

    test('getPlayerPits returns all pits for a player', () => {
      expect(pit.getPlayerPits(0)).toEqual([0, 1, 2, 3, 4, 5])
      expect(pit.getPlayerPits(1)).toEqual([6, 7, 8, 9, 10, 11])
    })

    test('sowSequence from pit 0 for player 0 includes own store', () => {
      const seq = pit.sowSequence(0, 0)
      expect(seq).toContain(12)
      expect(seq).not.toContain(13)
    })

    test('sowSequence skips opponent store', () => {
      const seq = pit.sowSequence(0, 0)
      expect(seq).not.toContain(13)
    })

    test('sowSequence from pit 0 visits pits in order', () => {
      const seq = pit.sowSequence(0, 0)
      expect(seq[0]).toBe(1)
      expect(seq[1]).toBe(2)
      expect(seq[5]).toBe(6)
    })

    test('sowSequence length is totalPits + own store - 1 (skip start + opponent store)', () => {
      const seq = pit.sowSequence(0, 0)
      expect(seq).toHaveLength(12)
    })

    test('neighbours of a pit are adjacent pits', () => {
      expect(pit.neighbours(3)).toEqual([2, 4])
    })

    test('neighbours wrap around', () => {
      expect(pit.neighbours(0)).toEqual([11, 1])
    })

    test('distance between pits', () => {
      expect(pit.distance(0, 5)).toBe(5)
      expect(pit.distance(0, 11)).toBe(1)
    })

    test('toJSON/fromJSON round-trip', () => {
      expect(pit.fromJSON(pit.toJSON(7))).toBe(7)
    })
  })

  describe('kalah variant (stores used for scoring)', () => {
    const pit = createPitTopology({ pitsPerSide: 6, players: 2, hasStores: true })

    test('sowSequence includes own store after last own pit', () => {
      const seq = pit.sowSequence(5, 0)
      expect(seq[0]).toBe(6)
      expect(seq).toContain(12)
    })
  })

  describe('no-store variant (oware traditional)', () => {
    const pit = createPitTopology({ pitsPerSide: 6, players: 2, hasStores: false })

    test('total positions: 12 pits, no stores', () => {
      expect(pit.getCount()).toBe(12)
    })

    test('storeIndex returns -1', () => {
      expect(pit.storeIndex(0)).toBe(-1)
    })

    test('sowSequence has no stores', () => {
      const seq = pit.sowSequence(0, 0)
      expect(seq.every(i => pit.isPit(i))).toBe(true)
    })
  })

  describe('4-row mancala (bao-style)', () => {
    const pit = createPitTopology({ pitsPerSide: 8, players: 2, hasStores: false })

    test('16 pits total for 2x8', () => {
      expect(pit.getTotalPits()).toBe(16)
    })

    test('player 1 pits are indices 8-15', () => {
      expect(pit.getPlayerPits(1)).toEqual([8, 9, 10, 11, 12, 13, 14, 15])
    })
  })
})
