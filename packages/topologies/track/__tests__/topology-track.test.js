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

  describe('points layout mode (backgammon-style)', () => {
    const track = createTrackTopology({
      positions: Array.from({ length: 24 }, (_, i) => `point-${i + 1}`),
      circuit: false,
    })

    test('produces 24 triangular polygon cells', () => {
      const layout = track.getLayout({ style: 'points', pointsPerSide: 12, pointWidth: 32, pointHeight: 120, boardHeight: 288 })
      const cells = layout.getCells()
      expect(cells).toHaveLength(24)
      expect(cells[0].element).toBe('polygon')
      expect(cells[0].attrs.points).toBeDefined()
    })

    test('alternates point-light and point-dark cell types', () => {
      const layout = track.getLayout({ style: 'points', pointsPerSide: 12, pointWidth: 32, boardHeight: 288 })
      const cells = layout.getCells()
      expect(cells[0].cellType).toBe('point-light')
      expect(cells[1].cellType).toBe('point-dark')
    })

    test('dimensions reflect point arrangement', () => {
      const layout = track.getLayout({ style: 'points', pointsPerSide: 12, pointWidth: 32, boardHeight: 288, halves: true, gapBetweenHalves: 24 })
      const dims = layout.getDimensions()
      expect(dims.height).toBe(288)
      expect(dims.width).toBe(6 * 32 * 2 + 24)
    })
  })

  describe('cross layout mode (pachisi-style)', () => {
    const track = createTrackTopology({
      positions: Array.from({ length: 96 }, (_, i) => `cell-${i}`),
      circuit: true,
    })

    test('produces cross-shaped grid of rect cells', () => {
      const layout = track.getLayout({ style: 'cross', cellSize: 20, armWidth: 3, armLength: 8 })
      const cells = layout.getCells()
      expect(cells.length).toBeGreaterThan(0)
      expect(cells[0].element).toBe('rect')
    })

    test('has centre cells and default cells', () => {
      const layout = track.getLayout({ style: 'cross', cellSize: 20, armWidth: 3, armLength: 8 })
      const cells = layout.getCells()
      const types = new Set(cells.map(c => c.cellType))
      expect(types.has('default')).toBe(true)
      expect(types.has('centre')).toBe(true)
    })

    test('castle positions get castle cellType', () => {
      const layout = track.getLayout({ style: 'cross', cellSize: 20, armWidth: 3, armLength: 8, castles: [5, 10, 20] })
      const cells = layout.getCells()
      expect(cells[5].cellType).toBe('castle')
      expect(cells[10].cellType).toBe('castle')
    })

    test('dimensions are square based on grid size', () => {
      const layout = track.getLayout({ style: 'cross', cellSize: 20, armWidth: 3, armLength: 8 })
      const dims = layout.getDimensions()
      expect(dims.width).toBe(dims.height)
      expect(dims.width).toBe(19 * 20)
    })
  })

  describe('position notation', () => {
    const track = createTrackTopology({
      positions: Array.from({ length: 24 }, (_, i) => `point-${i}`),
      circuit: false,
    })

    const bgVocabulary = {
      checker: { symbols: { 0: 'W', 1: 'B', count: true } },
    }

    describe('parsePosition()', () => {
      it('parses standard backgammon setup', () => {
        const notation = '0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B'
        const state = track.parsePosition(notation, bgVocabulary)

        expect(state['point-0']).toHaveLength(2)
        expect(state['point-0'][0]).toEqual({ type: 'checker', owner: 0 })
        expect(state['point-5']).toHaveLength(5)
        expect(state['point-5'][0]).toEqual({ type: 'checker', owner: 1 })
        expect(state['point-23']).toHaveLength(2)
        expect(state['point-23'][0]).toEqual({ type: 'checker', owner: 1 })
      })

      it('parses empty notation', () => {
        const state = track.parsePosition('empty', bgVocabulary)
        expect(Object.keys(state)).toHaveLength(0)
      })

      it('parses null notation', () => {
        const state = track.parsePosition(null, bgVocabulary)
        expect(Object.keys(state)).toHaveLength(0)
      })

      it('parses home and bar positions', () => {
        const notation = 'home:15W,home:15B'
        const state = track.parsePosition(notation, bgVocabulary)
        expect(state.home).toHaveLength(30)
        expect(state.home.filter(p => p.owner === 0)).toHaveLength(15)
        expect(state.home.filter(p => p.owner === 1)).toHaveLength(15)
      })

      it('parses bar position', () => {
        const notation = '0:1W,bar:2B,23:1B'
        const state = track.parsePosition(notation, bgVocabulary)
        expect(state.bar).toHaveLength(2)
        expect(state.bar[0]).toEqual({ type: 'checker', owner: 1 })
        expect(state['point-0']).toHaveLength(1)
      })
    })

    describe('serializePosition()', () => {
      it('serializes a simple position', () => {
        const state = {
          'point-0': [{ type: 'checker', owner: 0 }, { type: 'checker', owner: 0 }],
          'point-23': [{ type: 'checker', owner: 1 }, { type: 'checker', owner: 1 }],
        }
        const result = track.serializePosition(state, bgVocabulary)
        expect(result).toBe('0:2W,23:2B')
      })

      it('serializes empty state as empty string', () => {
        const result = track.serializePosition({}, bgVocabulary)
        expect(result).toBe('')
      })

      it('round-trips: parse → serialize', () => {
        const notation = '0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B'
        const state = track.parsePosition(notation, bgVocabulary)
        const result = track.serializePosition(state, bgVocabulary)
        expect(result).toBe(notation)
      })
    })
  })
})
