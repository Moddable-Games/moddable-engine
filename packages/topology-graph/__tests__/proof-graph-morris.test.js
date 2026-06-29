import { createGraphTopology } from '../src/topology-graph.js'

const MORRIS_NODES = [
  'a1', 'a4', 'a7', 'b2', 'b4', 'b6', 'c3', 'c4', 'c5',
  'd1', 'd2', 'd3', 'd5', 'd6', 'd7',
  'e3', 'e4', 'e5', 'f2', 'f4', 'f6', 'g1', 'g4', 'g7',
]

const MORRIS_EDGES = [
  ['a1', 'a4'], ['a4', 'a7'], ['a1', 'd1'], ['a7', 'd7'],
  ['b2', 'b4'], ['b4', 'b6'], ['b2', 'd2'], ['b6', 'd6'],
  ['c3', 'c4'], ['c4', 'c5'], ['c3', 'd3'], ['c5', 'd5'],
  ['d1', 'd2'], ['d2', 'd3'], ['d5', 'd6'], ['d6', 'd7'],
  ['d1', 'g1'], ['d7', 'g7'],
  ['e3', 'e4'], ['e4', 'e5'], ['e3', 'd3'], ['e5', 'd5'],
  ['f2', 'f4'], ['f4', 'f6'], ['f2', 'd2'], ['f6', 'd6'],
  ['g1', 'g4'], ['g4', 'g7'],
  ['a4', 'b4'], ['b4', 'c4'], ['e4', 'f4'], ['f4', 'g4'],
]

describe('proof: graph topology for morris', () => {
  let topo

  beforeEach(() => {
    topo = createGraphTopology({ nodes: MORRIS_NODES, edges: MORRIS_EDGES })
  })

  test('has 24 nodes', () => {
    expect(topo.size).toBe(24)
  })

  test('corner nodes have 2 neighbours', () => {
    expect(topo.neighbours('a1').sort()).toEqual(['a4', 'd1'])
    expect(topo.neighbours('g7').sort()).toEqual(['d7', 'g4'])
  })

  test('midpoint nodes have 3 neighbours', () => {
    expect(topo.neighbours('a4').sort()).toEqual(['a1', 'a7', 'b4'])
    expect(topo.neighbours('d2').sort()).toEqual(['b2', 'd1', 'd3', 'f2'])
  })

  test('centre-ring midpoints have 4 neighbours', () => {
    expect(topo.degree('d2')).toBe(4)
    expect(topo.degree('d6')).toBe(4)
  })

  test('movement: can reach adjacent node', () => {
    expect(topo.hasEdge('a1', 'a4')).toBe(true)
    expect(topo.hasEdge('a1', 'd1')).toBe(true)
  })

  test('movement: cannot reach non-adjacent node', () => {
    expect(topo.hasEdge('a1', 'b2')).toBe(false)
    expect(topo.hasEdge('a1', 'g7')).toBe(false)
  })

  test('distance across the board', () => {
    expect(topo.distance('a1', 'g7')).toBe(4)
    expect(topo.distance('a1', 'a7')).toBe(2)
  })

  test('shortest path from corner to corner', () => {
    const path = topo.shortestPath('a1', 'g1')
    expect(path[0]).toBe('a1')
    expect(path[path.length - 1]).toBe('g1')
    expect(path.length).toBe(3)
  })

  test('jumpPairs: hop over adjacent to their neighbour', () => {
    const pairs = topo.jumpPairs('a4')
    const landings = pairs.map(p => p.landing)
    expect(landings).toContain('d1')
    expect(landings).toContain('d7')
    expect(landings).toContain('c4')
  })

  test('all nodes are valid', () => {
    for (const node of MORRIS_NODES) {
      expect(topo.isValid(node)).toBe(true)
    }
  })

  test('layout provides cells and lines', () => {
    const layout = topo.getLayout()
    expect(layout.getCells()).toHaveLength(24)
    expect(layout.getLines().length).toBe(MORRIS_EDGES.length)
  })

  test('nine mens morris mill check using topology', () => {
    const mills = [
      ['a1', 'a4', 'a7'], ['b2', 'b4', 'b6'], ['c3', 'c4', 'c5'],
      ['d1', 'd2', 'd3'], ['d5', 'd6', 'd7'], ['e3', 'e4', 'e5'],
      ['f2', 'f4', 'f6'], ['g1', 'g4', 'g7'],
      ['a1', 'd1', 'g1'], ['b2', 'd2', 'f2'], ['c3', 'd3', 'e3'],
      ['a4', 'b4', 'c4'], ['e4', 'f4', 'g4'], ['a7', 'd7', 'g7'],
      ['b6', 'd6', 'f6'], ['c5', 'd5', 'e5'],
    ]
    for (const mill of mills) {
      for (let i = 0; i < mill.length - 1; i++) {
        expect(topo.distance(mill[i], mill[i + 1])).toBe(1)
      }
    }
  })
})
