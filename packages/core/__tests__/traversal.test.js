import { floodFill, getGroup, hasPath, findPatterns } from '../src/traversal.js'
import { bindTraversal } from '../src/bind-traversal.js'
import { createGridTopology } from '../../topology-grid/index.js'

describe('traversal algorithms', () => {
  describe('floodFill', () => {
    it('fills connected cells matching predicate on a grid', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      const getNeighbours = coord => grid.neighbours(coord)
      const filled = new Set([0, 1, 2, 5, 6])

      const result = floodFill(0, c => filled.has(c), getNeighbours)
      expect(result).toEqual(filled)
    })

    it('stops at cells that fail predicate', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      const getNeighbours = coord => grid.neighbours(coord)
      // 0 1 2
      // 3 4 5
      // 6 7 8
      // Block the middle — only corner cluster reachable
      const open = new Set([0, 1, 3])

      const result = floodFill(0, c => open.has(c), getNeighbours)
      expect(result).toEqual(new Set([0, 1, 3]))
    })

    it('single cell when no neighbours match', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      const getNeighbours = coord => grid.neighbours(coord)

      const result = floodFill(4, () => false, getNeighbours)
      expect(result).toEqual(new Set([4]))
    })
  })

  describe('getGroup', () => {
    it('returns group and boundary (Go-style capture detection)', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      const getNeighbours = coord => grid.neighbours(coord)
      // Place a group of black stones at 0,1,5
      const board = new Map([[0, 'black'], [1, 'black'], [5, 'black']])
      const predicate = c => board.get(c) === 'black'

      const result = getGroup(0, predicate, getNeighbours)
      expect(result.group).toEqual(new Set([0, 1, 5]))
      // Boundary should be the empty neighbours
      expect(result.boundary.has(2)).toBe(true)
      expect(result.boundary.has(6)).toBe(true)
      expect(result.boundary.has(10)).toBe(true)
    })

    it('boundary excludes group members', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      const getNeighbours = coord => grid.neighbours(coord)
      const board = new Map([[0, 'a'], [1, 'a'], [3, 'a'], [4, 'a']])
      const predicate = c => board.get(c) === 'a'

      const { group, boundary } = getGroup(0, predicate, getNeighbours)
      expect(group).toEqual(new Set([0, 1, 3, 4]))
      for (const cell of group) {
        expect(boundary.has(cell)).toBe(false)
      }
    })
  })

  describe('hasPath', () => {
    it('finds a path between two regions', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      const getNeighbours = coord => grid.neighbours(coord)
      // Open corridor along top row: 0,1,2,3,4
      const open = new Set([0, 1, 2, 3, 4])

      const result = hasPath(
        new Set([0]),
        c => c === 4,
        c => open.has(c),
        getNeighbours
      )
      expect(result).toBe(true)
    })

    it('returns false when no path exists', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      const getNeighbours = coord => grid.neighbours(coord)
      // Wall blocks passage: only 0 is open, 1 and 3 are walls
      const open = new Set([0])

      const result = hasPath(
        new Set([0]),
        c => c === 8,
        c => open.has(c),
        getNeighbours
      )
      expect(result).toBe(false)
    })

    it('start cells can satisfy end predicate immediately', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      const getNeighbours = coord => grid.neighbours(coord)

      const result = hasPath(
        new Set([4]),
        c => c === 4,
        () => true,
        getNeighbours
      )
      expect(result).toBe(true)
    })
  })

  describe('findPatterns — group type', () => {
    it('finds groups of minimum size', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      const getNeighbours = coord => grid.neighbours(coord)
      const board = new Map([[0, 'x'], [1, 'x'], [5, 'x'], [6, 'x']])
      const cells = [...board.keys()]
      const getOccupant = c => board.get(c) || null

      const patterns = [{ type: 'group', minSize: 3, id: 'cluster' }]
      const matches = findPatterns(cells, patterns, getOccupant, 'x', getNeighbours)
      expect(matches.length).toBe(1)
      expect(matches[0].pattern).toBe('cluster')
      expect(matches[0].cells.length).toBe(4)
    })

    it('ignores groups smaller than minSize', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      const getNeighbours = coord => grid.neighbours(coord)
      const board = new Map([[0, 'x'], [1, 'x']])
      const cells = [...board.keys()]
      const getOccupant = c => board.get(c) || null

      const patterns = [{ type: 'group', minSize: 3, id: 'big' }]
      const matches = findPatterns(cells, patterns, getOccupant, 'x', getNeighbours)
      expect(matches.length).toBe(0)
    })
  })

  describe('bindTraversal', () => {
    it('attaches traversal methods to a topology instance', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      bindTraversal(grid)

      expect(typeof grid.floodFill).toBe('function')
      expect(typeof grid.getGroup).toBe('function')
      expect(typeof grid.hasPath).toBe('function')
      expect(typeof grid.findPatterns).toBe('function')
    })

    it('bound getGroup works correctly', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      bindTraversal(grid)

      const board = new Map([[0, 'b'], [1, 'b'], [5, 'b']])
      const { group, boundary } = grid.getGroup(0, c => board.get(c) === 'b')
      expect(group).toEqual(new Set([0, 1, 5]))
      expect(boundary.size).toBeGreaterThan(0)
    })

    it('bound hasPath works (Go liberty check)', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      bindTraversal(grid)

      // Simulate: is there an empty cell reachable from a group?
      // Group at 0,1,5. Empty at 2,6,10 (liberties). Occupied at 3,4.
      const board = new Map([[0, 'b'], [1, 'b'], [5, 'b'], [3, 'w'], [4, 'w']])
      const groupCells = new Set([0, 1, 5])

      const hasLiberty = grid.hasPath(
        groupCells,
        c => !board.has(c),
        c => board.get(c) === 'b' || !board.has(c),
      )
      expect(hasLiberty).toBe(true)
    })

    it('bound hasPath detects surrounded group (no liberties)', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      bindTraversal(grid)

      // 0 1 2      w b w
      // 3 4 5  =>  w b w
      // 6 7 8      . w .
      const board = new Map([
        [1, 'b'], [4, 'b'],
        [0, 'w'], [2, 'w'], [3, 'w'], [5, 'w'], [7, 'w'],
      ])
      const groupCells = new Set([1, 4])

      const hasLiberty = grid.hasPath(
        groupCells,
        c => !board.has(c),
        c => board.get(c) === 'b',
      )
      expect(hasLiberty).toBe(false)
    })
  })
})
