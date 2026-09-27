import { createGridTopology } from '../index.js'

// Arcs join two edge points around the outside of a grid (engine#157).
describe('grid arcs', () => {
  const grid = createGridTopology({ rows: 6, cols: 6, arcs: [[[0, 1], [1, 0]]] })

  it('carries a line off one end of an arc and in at the other, turned', () => {
    expect(grid.arcStep(1, [-1, 0])).toEqual({ to: 6, dir: [0, 1], arc: true })
    expect(grid.arcStep(6, [0, -1])).toEqual({ to: 1, dir: [1, 0], arc: true })
  })

  it('steps as usual on the board, and nowhere off an edge without an arc', () => {
    expect(grid.arcStep(7, [0, -1])).toEqual({ to: 6, dir: [0, -1], arc: false })
    expect(grid.arcStep(2, [-1, 0])).toBeNull()
  })

  it('leaves ordinary steps alone', () => {
    expect(grid.step(1, [-1, 0])).toBeNull()
    expect(grid.hasArcs).toBe(true)
  })

  it('refuses an arc ending on a corner, which has two ways out', () => {
    expect(() => createGridTopology({ rows: 6, cols: 6, arcs: [[[0, 0], [1, 0]]] })).toThrow(/one edge/)
  })
})
