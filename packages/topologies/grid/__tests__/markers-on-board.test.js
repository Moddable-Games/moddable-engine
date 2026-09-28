import { renderGridLayout } from '../src/topology-grid.js'

// engine#196. Dobutsu (4x3) inherited shogi's hoshi at 9x9 positions and drew
// them outside its frame, where an embed clipped all but a stray dot. A marker
// is on the board up to its far edge, the line a cell-layout board ends on.
describe('markers op', () => {
  const circles = (layout) => layout.elements.filter(e => e.tag === 'circle')

  it('draws a marker only where the board has a point for it', () => {
    const layout = renderGridLayout(4, 3, {
      tileSize: 50,
      ops: [{ op: 'markers', items: [[1, 1], [3, 3], [2.5, 2.5], [5.5, 2.5], [2.5, 5.5], [-1, 0]], radius: 3, itemFill: '#333' }],
    })
    const drawn = circles(layout)
    // [1,1] a square's centre and [2.5,2.5] a corner inside; the rest are off it.
    expect(drawn).toHaveLength(2)
    for (const c of drawn) {
      expect(c.attrs.cx).toBeGreaterThanOrEqual(0)
      expect(c.attrs.cx).toBeLessThanOrEqual(layout.width)
      expect(c.attrs.cy).toBeGreaterThanOrEqual(0)
      expect(c.attrs.cy).toBeLessThanOrEqual(layout.height)
    }
  })
})
