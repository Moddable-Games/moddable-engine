import { createGridTopology } from '../src/topology-grid.js'

describe('renderLayout — tiles mode', () => {
  const grid = createGridTopology({ rows: 8, cols: 8 })

  test('uniform colouring produces background rect + grid lines + cells', () => {
    const result = grid.renderLayout({
      tileSize: 40,
      mode: 'tiles',
      cellColor: 'uniform',
      colors: { mono: '#2e7d32', gridLine: '#1b5e20' },
      showLabels: false,
    })

    expect(result.width).toBe(320)
    expect(result.height).toBe(320)
    expect(result.elements[0]).toEqual({
      tag: 'rect',
      attrs: { x: 0, y: 0, width: 320, height: 320, fill: '#2e7d32' },
    })

    const lines = result.elements.filter(e => e.tag === 'line')
    expect(lines.length).toBe(18) // 9 vertical + 9 horizontal

    expect(result.cells.length).toBe(64)
    expect(result.cells[0].id).toBe('a8')
    expect(result.cells[63].id).toBe('h1')
    expect(result.cells[0].x).toBe(20)
    expect(result.cells[0].y).toBe(20)
  })

  test('checkered colouring produces individual cell rects', () => {
    const result = grid.renderLayout({
      tileSize: 40,
      mode: 'tiles',
      cellColor: 'checkered',
      colors: { light: '#f0d9b5', dark: '#b58863' },
      showLabels: false,
    })

    const rects = result.elements.filter(e => e.tag === 'rect')
    expect(rects.length).toBe(64)
    expect(rects[0].attrs.fill).toBe('#f0d9b5') // a8 = light (0+0 even)
    expect(rects[1].attrs.fill).toBe('#b58863') // b8 = dark (0+1 odd)
  })

  test('cellMap colouring uses zone colours', () => {
    const result = grid.renderLayout({
      tileSize: 40,
      mode: 'tiles',
      cellColor: 'cellMap',
      cellMap: 'T......T\n........\n........\n........\n........\n........\n........\nT......T',
      colors: { light: '#d9b483', zoneColors: { T: '#8b4513', '.': '#d9b483' } },
      showLabels: false,
    })

    const rects = result.elements.filter(e => e.tag === 'rect')
    expect(rects[0].attrs.fill).toBe('#8b4513') // corner = throne
    expect(rects[1].attrs.fill).toBe('#d9b483') // normal
  })

  test('labels generated when showLabels is true', () => {
    const result = grid.renderLayout({
      tileSize: 40,
      mode: 'tiles',
      cellColor: 'uniform',
      colors: { mono: '#d9b483' },
      showLabels: true,
    })

    expect(result.labels.length).toBe(16) // 8 file + 8 rank
    expect(result.labels[0].text).toBe('a')
    expect(result.labels[8].text).toBe('8')
    expect(result.width).toBe(320 + 48) // boardW + 2*pad
  })
})

describe('renderLayout — intersections mode', () => {
  const grid = createGridTopology({ rows: 19, cols: 19 })

  test('basic intersection grid produces lines + cells', () => {
    const result = grid.renderLayout({
      tileSize: 20,
      mode: 'intersections',
      colors: { background: '#dcb35c', surface: '#d4a843', gridLine: '#3d2b1a' },
      showLabels: false,
      inset: 15,
    })

    const lines = result.elements.filter(e => e.tag === 'line')
    expect(lines.length).toBe(38) // 19 horizontal + 19 vertical
    expect(result.cells.length).toBe(361) // 19x19
  })

  test('star point markers rendered at specified positions', () => {
    const result = grid.renderLayout({
      tileSize: 20,
      mode: 'intersections',
      colors: { gridLine: '#3d2b1a' },
      showLabels: false,
      inset: 15,
      markers: [[3, 3], [3, 9], [3, 15], [9, 9]],
    })

    const circles = result.elements.filter(e => e.tag === 'circle')
    expect(circles.length).toBe(4)
    expect(circles[0].attrs.r).toBe(3)
  })

  test('river gap splits vertical lines', () => {
    const xiangqi = createGridTopology({ rows: 10, cols: 9 })
    const result = xiangqi.renderLayout({
      tileSize: 40,
      mode: 'intersections',
      colors: { gridLine: '#333' },
      showLabels: false,
      inset: 20,
      riverAfterRow: 4,
      riverHeight: 20,
    })

    const vLines = result.elements.filter(e => e.tag === 'line' && e.attrs.x1 === e.attrs.x2)
    expect(vLines.length).toBe(18) // 9 cols × 2 (split above/below river)
  })

  test('palace diagonals rendered', () => {
    const xiangqi = createGridTopology({ rows: 10, cols: 9 })
    const result = xiangqi.renderLayout({
      tileSize: 40,
      mode: 'intersections',
      colors: { gridLine: '#333' },
      showLabels: false,
      inset: 20,
      palaces: [
        { row: 0, col: 3, width: 2, height: 2 },
        { row: 7, col: 3, width: 2, height: 2 },
      ],
    })

    const dashedLines = result.elements.filter(e => e.attrs?.['stroke-dasharray'])
    expect(dashedLines.length).toBe(4) // 2 diagonals × 2 palaces
  })

  test('go-style labels skip I', () => {
    const result = grid.renderLayout({
      tileSize: 20,
      mode: 'intersections',
      colors: {},
      showLabels: true,
      inset: 15,
      labelStyle: 'go',
    })

    const fileLabels = result.labels.filter(l => l.text.length === 1 && l.text >= 'A')
    expect(fileLabels.map(l => l.text)).not.toContain('I')
    expect(fileLabels[0].text).toBe('A')
    expect(fileLabels[8].text).toBe('J') // skips I
  })
})
