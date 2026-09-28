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
