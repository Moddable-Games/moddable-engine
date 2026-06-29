import { createGraphTopology } from '../src/topology-graph.js'

const TRIANGLE = {
  nodes: ['a', 'b', 'c'],
  edges: [['a', 'b'], ['b', 'c'], ['c', 'a']],
}

const LINEAR = {
  nodes: ['start', 'mid', 'end'],
  edges: [['start', 'mid'], ['mid', 'end']],
}

describe('createGraphTopology', () => {
  describe('basic structure', () => {
    test('reports correct size', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.size).toBe(3)
    })

    test('validates nodes', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.isValid('a')).toBe(true)
      expect(t.isValid('z')).toBe(false)
    })

    test('returns all nodes', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.getNodes().sort()).toEqual(['a', 'b', 'c'])
    })

    test('returns all edges', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.getEdges()).toHaveLength(3)
    })
  })

  describe('adjacency', () => {
    test('undirected: both directions', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.neighbours('a')).toContain('b')
      expect(t.neighbours('b')).toContain('a')
    })

    test('directed: one direction only', () => {
      const t = createGraphTopology({ nodes: ['a', 'b'], edges: [['a', 'b']], directed: true })
      expect(t.neighbours('a')).toContain('b')
      expect(t.neighbours('b')).not.toContain('a')
    })

    test('hasEdge checks adjacency', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.hasEdge('a', 'b')).toBe(true)
      expect(t.hasEdge('a', 'c')).toBe(true)
    })

    test('degree counts connections', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.degree('a')).toBe(2)
    })
  })

  describe('distance and pathfinding', () => {
    test('distance to self is 0', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.distance('a', 'a')).toBe(0)
    })

    test('distance to neighbour is 1', () => {
      const t = createGraphTopology(LINEAR)
      expect(t.distance('start', 'mid')).toBe(1)
    })

    test('distance across two edges', () => {
      const t = createGraphTopology(LINEAR)
      expect(t.distance('start', 'end')).toBe(2)
    })

    test('distance to unreachable is -1', () => {
      const t = createGraphTopology({ nodes: ['a', 'b'], edges: [], directed: false })
      expect(t.distance('a', 'b')).toBe(-1)
    })

    test('shortestPath returns node sequence', () => {
      const t = createGraphTopology(LINEAR)
      expect(t.shortestPath('start', 'end')).toEqual(['start', 'mid', 'end'])
    })

    test('shortestPath to self', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.shortestPath('a', 'a')).toEqual(['a'])
    })

    test('shortestPath when unreachable is null', () => {
      const t = createGraphTopology({ nodes: ['a', 'b'], edges: [] })
      expect(t.shortestPath('a', 'b')).toBeNull()
    })
  })

  describe('jump and adjacent pairs', () => {
    test('jumpPairs finds hop-over-landing pairs', () => {
      const t = createGraphTopology(LINEAR)
      const pairs = t.jumpPairs('start')
      expect(pairs).toContainEqual({ over: 'mid', landing: 'end' })
    })

    test('adjacentPairs finds neighbour-and-beyond', () => {
      const t = createGraphTopology(LINEAR)
      const pairs = t.adjacentPairs('start')
      expect(pairs).toContainEqual({ adjacent: 'mid', far: 'end' })
    })
  })

  describe('serialisation', () => {
    test('toJSON returns node name', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.toJSON('a')).toBe('a')
    })

    test('fromJSON returns node name', () => {
      const t = createGraphTopology(TRIANGLE)
      expect(t.fromJSON('a')).toBe('a')
    })
  })

  describe('layout', () => {
    test('getLayout returns cells for all nodes', () => {
      const t = createGraphTopology(TRIANGLE)
      const layout = t.getLayout()
      expect(layout.getCells()).toHaveLength(3)
    })

    test('getLayout returns lines for all edges', () => {
      const t = createGraphTopology(TRIANGLE)
      const layout = t.getLayout()
      expect(layout.getLines()).toHaveLength(3)
    })

    test('getLayout respects custom dimensions', () => {
      const t = createGraphTopology(TRIANGLE)
      const layout = t.getLayout({ width: 600, height: 300 })
      expect(layout.getDimensions()).toEqual({ width: 600, height: 300 })
    })

    test('getLayout accepts custom positions', () => {
      const t = createGraphTopology(TRIANGLE)
      const positions = { a: { x: 10, y: 10 }, b: { x: 100, y: 10 }, c: { x: 50, y: 80 } }
      const layout = t.getLayout({ positions })
      const cells = layout.getCells()
      expect(cells.find(c => c.key === 'a').center).toEqual({ x: 10, y: 10 })
    })
  })
})
