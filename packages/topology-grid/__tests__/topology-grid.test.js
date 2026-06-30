import { createGridTopology } from '../src/topology-grid.js'

describe('topology-grid', () => {
  const grid = createGridTopology({ rows: 8, cols: 8 })

  test('size is rows * cols', () => {
    expect(grid.size).toBe(64)
  })

  test('toIndex converts row,col to index', () => {
    expect(grid.toIndex(0, 0)).toBe(0)
    expect(grid.toIndex(0, 7)).toBe(7)
    expect(grid.toIndex(7, 0)).toBe(56)
    expect(grid.toIndex(7, 7)).toBe(63)
  })

  test('toRC converts index to [row, col]', () => {
    expect(grid.toRC(0)).toEqual([0, 0])
    expect(grid.toRC(7)).toEqual([0, 7])
    expect(grid.toRC(56)).toEqual([7, 0])
    expect(grid.toRC(63)).toEqual([7, 7])
  })

  test('toRC and toIndex are inverses', () => {
    for (let i = 0; i < 64; i++) {
      const [r, c] = grid.toRC(i)
      expect(grid.toIndex(r, c)).toBe(i)
    }
  })

  test('isValid for valid indices', () => {
    expect(grid.isValid(0)).toBe(true)
    expect(grid.isValid(63)).toBe(true)
    expect(grid.isValid(32)).toBe(true)
  })

  test('isValid rejects out-of-bounds', () => {
    expect(grid.isValid(-1)).toBe(false)
    expect(grid.isValid(64)).toBe(false)
  })

  test('neighbours returns orthogonal adjacent squares', () => {
    const center = grid.toIndex(3, 3)
    const n = grid.neighbours(center)
    expect(n).toHaveLength(4)
    expect(n).toContain(grid.toIndex(2, 3))
    expect(n).toContain(grid.toIndex(4, 3))
    expect(n).toContain(grid.toIndex(3, 2))
    expect(n).toContain(grid.toIndex(3, 4))
  })

  test('neighbours at corner returns 2', () => {
    expect(grid.neighbours(0)).toHaveLength(2)
  })

  test('neighbours at edge returns 3', () => {
    expect(grid.neighbours(grid.toIndex(0, 3))).toHaveLength(3)
  })

  test('diagonalNeighbours returns 4 diagonals', () => {
    const center = grid.toIndex(3, 3)
    const d = grid.diagonalNeighbours(center)
    expect(d).toHaveLength(4)
    expect(d).toContain(grid.toIndex(2, 2))
    expect(d).toContain(grid.toIndex(2, 4))
    expect(d).toContain(grid.toIndex(4, 2))
    expect(d).toContain(grid.toIndex(4, 4))
  })

  test('allNeighbours returns 8 for center square', () => {
    const center = grid.toIndex(3, 3)
    expect(grid.allNeighbours(center)).toHaveLength(8)
  })

  test('distance (manhattan)', () => {
    expect(grid.distance(0, 63)).toBe(14)
    expect(grid.distance(0, 0)).toBe(0)
    expect(grid.distance(grid.toIndex(0, 0), grid.toIndex(7, 7))).toBe(14)
  })

  test('chebyshev distance', () => {
    expect(grid.chebyshev(0, 63)).toBe(7)
    expect(grid.chebyshev(grid.toIndex(0, 0), grid.toIndex(2, 3))).toBe(3)
  })

  test('toJSON/fromJSON round-trip', () => {
    expect(grid.fromJSON(grid.toJSON(42))).toBe(42)
  })

  test('ray returns squares in direction', () => {
    const r = grid.ray(grid.toIndex(3, 3), 0, 1)
    expect(r).toEqual([grid.toIndex(3, 4), grid.toIndex(3, 5), grid.toIndex(3, 6), grid.toIndex(3, 7)])
  })

  test('ray stops at board edge', () => {
    const r = grid.ray(grid.toIndex(0, 0), -1, 0)
    expect(r).toEqual([])
  })

  test('ray with maxSteps', () => {
    const r = grid.ray(grid.toIndex(3, 3), 0, 1, 2)
    expect(r).toHaveLength(2)
  })

  test('non-square grid works', () => {
    const rect = createGridTopology({ rows: 10, cols: 9 })
    expect(rect.size).toBe(90)
    expect(rect.toRC(9)).toEqual([1, 0])
    expect(rect.toIndex(9, 8)).toBe(89)
  })

  test('wrap mode connects edges', () => {
    const wrapped = createGridTopology({ rows: 8, cols: 8, wrap: true })
    const topLeft = 0
    const n = wrapped.neighbours(topLeft)
    expect(n).toContain(wrapped.toIndex(7, 0))
    expect(n).toContain(wrapped.toIndex(0, 7))
  })

  describe('intersection layout mode', () => {
    const go = createGridTopology({ rows: 19, cols: 19 })

    test('produces intersection cells at line crossings', () => {
      const layout = go.getLayout({ mode: 'intersections', spacing: 20 })
      const cells = layout.getCells()
      expect(cells).toHaveLength(361)
      expect(cells[0].cellType).toBe('intersection')
      expect(cells[0].element).toBe('circle')
      expect(cells[0].center).toEqual({ x: 0, y: 0 })
    })

    test('produces grid lines (rows + cols)', () => {
      const layout = go.getLayout({ mode: 'intersections', spacing: 20 })
      const lines = layout.getLines()
      expect(lines).toHaveLength(38)
    })

    test('dimensions are (cols-1)*spacing x (rows-1)*spacing', () => {
      const layout = go.getLayout({ mode: 'intersections', spacing: 20 })
      expect(layout.getDimensions()).toEqual({ width: 360, height: 360 })
    })

    test('star points appear as annotations', () => {
      const stars = [[3, 3], [3, 9], [3, 15], [9, 9]]
      const layout = go.getLayout({ mode: 'intersections', spacing: 20, starPoints: stars })
      const ann = layout.getAnnotations()
      expect(ann).toHaveLength(4)
      expect(ann[0].element).toBe('circle')
      expect(ann[0].attrs.cx).toBe(60)
      expect(ann[0].attrs.cy).toBe(60)
    })

    test('labels skip letter I (Go convention)', () => {
      const layout = go.getLayout({ mode: 'intersections', spacing: 20 })
      const labels = layout.getLabels()
      const colLabels = labels.filter(l => l.y > 360)
      expect(colLabels[0].text).toBe('A')
      expect(colLabels[7].text).toBe('H')
      expect(colLabels[8].text).toBe('J')
    })

    test('river mode adds gap between rows', () => {
      const xiangqi = createGridTopology({ rows: 10, cols: 9 })
      const layout = xiangqi.getLayout({ mode: 'intersections', spacing: 40, riverAfterRow: 4, riverHeight: 30 })
      const dims = layout.getDimensions()
      expect(dims.height).toBe(9 * 40 + 30)
      const cells = layout.getCells()
      const row4 = cells[4 * 9]
      const row5 = cells[5 * 9]
      expect(row5.center.y - row4.center.y).toBe(40 + 30)
    })

    test('palace diagonals add cross lines', () => {
      const xiangqi = createGridTopology({ rows: 10, cols: 9 })
      const layout = xiangqi.getLayout({
        mode: 'intersections',
        spacing: 40,
        riverAfterRow: 4,
        riverHeight: 30,
        palaces: [{ row: 0, col: 3, width: 2, height: 2 }, { row: 7, col: 3, width: 2, height: 2 }],
      })
      const lines = layout.getLines()
      // 10 horiz + 18 vert (9 cols split by river) + 4 palace diagonals
      expect(lines.length).toBe(32)
    })

    test('alternating diagonals for alquerque/fanorona', () => {
      const board = createGridTopology({ rows: 5, cols: 9 })
      const layout = board.getLayout({ mode: 'intersections', spacing: 30, diagonals: 'alternating' })
      const lines = layout.getLines()
      expect(lines.length).toBeGreaterThan(5 + 9)
    })
  })
})
