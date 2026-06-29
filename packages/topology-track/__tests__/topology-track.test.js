import { createTrackTopology } from '../src/topology-track.js'

describe('topology-track', () => {
  describe('linear track (backgammon-style)', () => {
    const track = createTrackTopology({
      positions: Array.from({ length: 24 }, (_, i) => `point-${i + 1}`),
      circuit: false,
    })

    test('has 24 positions', () => {
      expect(track.getCount()).toBe(24)
    })

    test('isValid for named positions', () => {
      expect(track.isValid('point-1')).toBe(true)
      expect(track.isValid('point-24')).toBe(true)
      expect(track.isValid('point-25')).toBe(false)
    })

    test('next moves forward', () => {
      expect(track.next('point-1')).toBe('point-2')
      expect(track.next('point-1', 6)).toBe('point-7')
    })

    test('next returns null past end', () => {
      expect(track.next('point-24')).toBeNull()
    })

    test('previous moves backward', () => {
      expect(track.previous('point-5')).toBe('point-4')
    })

    test('previous returns null before start', () => {
      expect(track.previous('point-1')).toBeNull()
    })

    test('distance is absolute difference', () => {
      expect(track.distance('point-1', 'point-7')).toBe(6)
      expect(track.distance('point-7', 'point-1')).toBe(6)
    })

    test('forwardDistance can be negative for linear', () => {
      expect(track.forwardDistance('point-1', 'point-7')).toBe(6)
      expect(track.forwardDistance('point-7', 'point-1')).toBe(-6)
    })

    test('neighbours returns adjacent positions', () => {
      expect(track.neighbours('point-5')).toEqual(['point-4', 'point-6'])
    })

    test('start has one neighbour', () => {
      expect(track.neighbours('point-1')).toEqual(['point-2'])
    })

    test('end has one neighbour', () => {
      expect(track.neighbours('point-24')).toEqual(['point-23'])
    })

    test('getRange returns sequence of positions', () => {
      expect(track.getRange('point-1', 3)).toEqual(['point-2', 'point-3', 'point-4'])
    })

    test('getRange stops at end', () => {
      expect(track.getRange('point-22', 5)).toEqual(['point-23', 'point-24'])
    })

    test('toJSON/fromJSON identity', () => {
      expect(track.fromJSON(track.toJSON('point-12'))).toBe('point-12')
    })

    test('isCircuit returns false', () => {
      expect(track.isCircuit()).toBe(false)
    })
  })

  describe('circuit track (monopoly-style)', () => {
    const positions = ['go', 'med-ave', 'community-1', 'baltic', 'income-tax',
      'reading-rr', 'oriental', 'chance-1', 'vermont', 'connecticut',
      'jail', 'st-charles', 'electric', 'states', 'virginia',
      'penn-rr', 'st-james', 'community-2', 'tennessee', 'ny-ave',
      'free-parking', 'kentucky', 'chance-2', 'indiana', 'illinois',
      'bo-rr', 'atlantic', 'ventnor', 'water-works', 'marvin',
      'go-to-jail', 'pacific', 'nc-ave', 'community-3', 'penn-ave',
      'short-line', 'chance-3', 'park-place', 'luxury-tax', 'boardwalk']

    const track = createTrackTopology({ positions, circuit: true })

    test('has 40 positions', () => {
      expect(track.getCount()).toBe(40)
    })

    test('isCircuit returns true', () => {
      expect(track.isCircuit()).toBe(true)
    })

    test('next wraps around from last to first', () => {
      expect(track.next('boardwalk')).toBe('go')
    })

    test('previous wraps from first to last', () => {
      expect(track.previous('go')).toBe('boardwalk')
    })

    test('next with steps wraps correctly', () => {
      expect(track.next('boardwalk', 3)).toBe('community-1')
    })

    test('distance uses shortest path', () => {
      expect(track.distance('go', 'boardwalk')).toBe(1)
      expect(track.distance('boardwalk', 'go')).toBe(1)
    })

    test('forwardDistance always positive in circuit', () => {
      expect(track.forwardDistance('go', 'jail')).toBe(10)
      expect(track.forwardDistance('boardwalk', 'go')).toBe(1)
    })

    test('neighbours wraps at boundaries', () => {
      const n = track.neighbours('go')
      expect(n).toContain('boardwalk')
      expect(n).toContain('med-ave')
    })

    test('getRange wraps around', () => {
      const range = track.getRange('boardwalk', 3)
      expect(range).toEqual(['go', 'med-ave', 'community-1'])
    })
  })

  describe('track with metadata', () => {
    const track = createTrackTopology({
      positions: [
        { name: 'start', type: 'safe' },
        { name: 'path-1', type: 'normal' },
        { name: 'path-2', type: 'normal' },
        { name: 'rosette', type: 'safe' },
        { name: 'path-4', type: 'normal' },
        { name: 'end', type: 'finish' },
      ],
      circuit: false,
    })

    test('getMeta returns position metadata', () => {
      const meta = track.getMeta('rosette')
      expect(meta.type).toBe('safe')
      expect(meta.index).toBe(3)
    })

    test('getMeta returns null for invalid position', () => {
      expect(track.getMeta('nonexistent')).toBeNull()
    })

    test('getAll returns all position names in order', () => {
      expect(track.getAll()).toEqual(['start', 'path-1', 'path-2', 'rosette', 'path-4', 'end'])
    })
  })

  describe('track with branches (pachisi-style)', () => {
    const track = createTrackTopology({
      positions: ['start', 'shared-1', 'shared-2', 'shared-3', 'fork', 'home-a', 'home-b'],
      circuit: false,
      branches: {
        'fork:playerA': 'home-a',
        'fork:playerB': 'home-b',
      },
    })

    test('branch routes player to correct home', () => {
      expect(track.next('fork', 1, { player: 'playerA' })).toBe('home-a')
      expect(track.next('fork', 1, { player: 'playerB' })).toBe('home-b')
    })

    test('without player, follows default sequence', () => {
      expect(track.next('fork')).toBe('home-a')
    })
  })
})
