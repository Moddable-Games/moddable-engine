import { createGridTopology } from '../grid/index.js'

// engine#161. A grid board does not have to draw a diagonal at every point.
// Alquerque's lines run corner to corner and midpoint to midpoint, which leaves
// the points with an even coordinate sum carrying all four diagonals and the
// rest carrying none - the 8-neighbour/4-neighbour alternation that Alquerque
// and Fanorona are built on, and that the fanorona-chess rulebook describes in
// those words.
//
// The topology drew that board and then answered movement questions as though
// every diagonal existed, so the drawn board and the played board were two
// different boards.

const COLS = 5
const at = (r, c) => r * COLS + c

describe('diagonals that are not drawn are not there (engine#161)', () => {
  const alternating = createGridTopology({ rows: 5, cols: 5, diagonals: 'alternating' })
  const full = createGridTopology({ rows: 5, cols: 5 })

  it('gives a point with an even coordinate sum all four diagonals', () => {
    expect(alternating.diagonalNeighbours(at(2, 2)).sort((a, b) => a - b))
      .toEqual([at(1, 1), at(1, 3), at(3, 1), at(3, 3)].sort((a, b) => a - b))
  })

  it('gives a point with an odd coordinate sum none', () => {
    expect(alternating.diagonalNeighbours(at(2, 1))).toEqual([])
    expect(alternating.diagonalNeighbours(at(0, 1))).toEqual([])
  })

  it('leaves the orthogonal neighbours of both alone', () => {
    for (const cell of [at(2, 2), at(2, 1)]) {
      expect(alternating.neighbours(cell)).toEqual(full.neighbours(cell))
    }
  })

  it('refuses a diagonal step from a point that draws none', () => {
    expect(alternating.step(at(2, 1), [1, 1])).toBe(null)
    expect(alternating.step(at(2, 2), [1, 1])).toBe(at(3, 3))
    // Orthogonal steps are unaffected on both.
    expect(alternating.step(at(2, 1), [1, 0])).toBe(at(3, 1))
  })

  it('runs no ray along a diagonal a point does not draw', () => {
    expect(alternating.rays(at(2, 1), [[1, 1]])).toEqual([[]])
    expect(alternating.rays(at(2, 2), [[1, 1]])).toEqual([[at(3, 3), at(4, 4)]])
  })

  it('leaves an ordinary grid board with all four diagonals everywhere', () => {
    for (const cell of [at(2, 2), at(2, 1), at(1, 2)]) {
      expect(full.diagonalNeighbours(cell).length).toBe(4)
    }
    expect(full.step(at(2, 1), [1, 1])).toBe(at(3, 2))
  })

  it('takes none at all when the board draws none', () => {
    const orthogonalOnly = createGridTopology({ rows: 5, cols: 5, diagonals: 'none' })
    expect(orthogonalOnly.diagonalNeighbours(at(2, 2))).toEqual([])
    expect(orthogonalOnly.neighbours(at(2, 2)).length).toBe(4)
  })

  // The whole point is that the two agree, so assert it against the drawing
  // rather than against a second copy of the rule.
  it('draws a line exactly where it says one can be stepped along', () => {
    const layout = alternating.getLayout({ mode: 'intersections', spacing: 48 })
    const drawn = new Set()
    for (const line of layout.getLines()) {
      const r1 = Math.round(line.y1 / 48), c1 = Math.round(line.x1 / 48)
      const r2 = Math.round(line.y2 / 48), c2 = Math.round(line.x2 / 48)
      if (r1 === r2 || c1 === c2) continue
      if (Math.abs(r1 - r2) !== 1) continue
      drawn.add(`${at(r1, c1)}-${at(r2, c2)}`)
      drawn.add(`${at(r2, c2)}-${at(r1, c1)}`)
    }
    expect(drawn.size).toBeGreaterThan(0)

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        for (const neighbour of alternating.diagonalNeighbours(at(r, c))) {
          expect(drawn.has(`${at(r, c)}-${neighbour}`)).toBe(true)
        }
      }
    }
    // And nothing is drawn that cannot be walked.
    for (const key of drawn) {
      const [from, to] = key.split('-').map(Number)
      expect(alternating.diagonalNeighbours(from)).toContain(to)
    }
  })
})
