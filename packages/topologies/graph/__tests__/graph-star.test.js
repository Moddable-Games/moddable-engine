import { createGraphTopology, starStations } from '../index.js'

// The Stern-Halma star as a playable graph (engine#153): 121 holes on a
// lattice, so a ray or a jump runs straight rather than along any two edges.
describe('the star graph', () => {
  const star = createGraphTopology({ structure: 'star', params: { armSize: 4 } })

  it('has 121 holes and six arms of ten', () => {
    const { nodes } = starStations({ armSize: 4 })
    expect(nodes).toHaveLength(121)
    for (const arm of ['N', 'NE', 'SE', 'S', 'SW', 'NW']) expect(nodes.filter(n => n.arm === arm)).toHaveLength(10)
  })

  it('gives the centre six neighbours and six straight rays to the rim', () => {
    expect(star.neighbours('h61').sort()).toEqual(['h51', 'h52', 'h60', 'h62', 'h70', 'h71'])
    const east = star.rays('h61').find(ray => ray[0] === 'h62')
    expect(east).toEqual(['h62', 'h63', 'h64', 'h65'])
  })

  it('jumps in a straight line only', () => {
    expect(star.jumpPairs('h61').find(p => p.over === 'h62')).toEqual({ over: 'h62', landing: 'h63' })
    expect(star.jumpPairs('h61').every(p => star.rays('h61').some(ray => ray[0] === p.over && ray[1] === p.landing))).toBe(true)
  })
})

// Asalto's cross (engine#154): 33 points on a grid, diagonals in every square,
// so an Officer's jump runs straight along a drawn line.
describe('the cross graph', () => {
  const cross = createGraphTopology({ structure: 'grid-cross', params: { rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]] } })

  it('has 33 points and places each on its row and column', () => {
    expect(cross.getNodes()).toHaveLength(33)
    expect(cross.toRC('n1')).toEqual([0, 2])
    expect(cross.toRC('n17')).toEqual([3, 3])
  })

  it('jumps straight along drawn lines only', () => {
    const pairs = cross.jumpPairs('n17')
    expect(pairs).toContainEqual({ over: 'n10', landing: 'n5' })
    expect(pairs).toContainEqual({ over: 'n24', landing: 'n29' })
    // From n1 there is no line off the top of the board.
    expect(cross.rays('n1').every(ray => ray.every(p => cross.toRC(p)[0] >= 0))).toBe(true)
  })
})
