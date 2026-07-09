import { createGridTopology } from '../src/topology-grid.js'

describe('renderLayout — single pipeline, no branches per provider', () => {
  const grid8 = createGridTopology({ rows: 8, cols: 8 })

  test('uniform fill: background + grid lines + cells', () => {
    const result = grid8.renderLayout({
      tileSize: 40,
      positionType: 'square',
      showLabels: false,
      backgrounds: [{ fill: '#2e7d32' }],
      lines: { color: '#1b5e20', width: 1.5 },
    })

    expect(result.width).toBe(320)
    expect(result.height).toBe(320)
    expect(result.elements[0].tag).toBe('rect')
    expect(result.elements[0].attrs.fill).toBe('#2e7d32')
    const lines = result.elements.filter(e => e.tag === 'line')
    expect(lines.length).toBe(18) // 9 vertical + 9 horizontal
    expect(result.cells.length).toBe(64)
    expect(result.cells[0].id).toBe('a8')
    expect(result.cells[63].id).toBe('h1')
  })

  test('checkered fill via cellFill function', () => {
    const light = '#f0d9b5', dark = '#b58863'
    const result = grid8.renderLayout({
      tileSize: 40,
      positionType: 'square',
      showLabels: false,
      cellFill: (r, c) => (r + c) % 2 === 0 ? light : dark,
      lines: { horizontal: false },
    })

    const rects = result.elements.filter(e => e.tag === 'rect')
    expect(rects.length).toBe(64)
    expect(rects[0].attrs.fill).toBe(light) // (0,0) even
    expect(rects[1].attrs.fill).toBe(dark)  // (0,1) odd
  })

  test('cellMap fill via cellFill function with zone lookup', () => {
    const zoneMap = 'T......T\n........\n........\n........\n........\n........\n........\nT......T'.split('\n')
    const zoneColors = { T: '#8b4513', '.': '#d9b483' }
    const result = grid8.renderLayout({
      tileSize: 40,
      positionType: 'square',
      showLabels: false,
      cellFill: (r, c) => zoneColors[zoneMap[r]?.[c] || '.'],
      lines: { color: '#8b6914', width: 1.5 },
    })

    const rects = result.elements.filter(e => e.tag === 'rect')
    expect(rects[0].attrs.fill).toBe('#8b4513') // corner throne
    expect(rects[1].attrs.fill).toBe('#d9b483') // normal
  })

  test('intersection grid with markers (Go-like)', () => {
    const grid19 = createGridTopology({ rows: 19, cols: 19 })
    const result = grid19.renderLayout({
      tileSize: 20,
      positionType: 'intersection',
      showLabels: false,
      inset: 15,
      backgrounds: [
        { fill: '#dcb35c' },
        { x: 39, y: 39, width: 360, height: 360, fill: '#d4a843', rx: 2 },
      ],
      lines: { color: '#3d2b1a', width: 0.8 },
      markers: [[3, 3], [3, 9], [3, 15], [9, 9]],
    })

    const lines = result.elements.filter(e => e.tag === 'line')
    expect(lines.length).toBe(38) // 19h + 19v
    const circles = result.elements.filter(e => e.tag === 'circle')
    expect(circles.length).toBe(4)
    expect(result.cells.length).toBe(361)
  })

  test('split vertical lines (river-like)', () => {
    const grid10x9 = createGridTopology({ rows: 10, cols: 9 })
    const result = grid10x9.renderLayout({
      tileSize: 40,
      positionType: 'intersection',
      showLabels: false,
      inset: 20,
      backgrounds: [{ fill: '#f5e6c8' }],
      lines: { color: '#333', width: 1, splitAfterRow: 4 },
    })

    const vLines = result.elements.filter(e => e.tag === 'line' && e.attrs.x1 === e.attrs.x2)
    // Edge cols (0, 8) get 1 full line each = 2
    // Inner cols (1-7) get 2 split lines each = 14
    expect(vLines.length).toBe(16)
  })

  test('diagonal lines via predicate (alternating pattern)', () => {
    const grid5x9 = createGridTopology({ rows: 5, cols: 9 })
    const result = grid5x9.renderLayout({
      tileSize: 40,
      positionType: 'intersection',
      showLabels: false,
      inset: 20,
      lines: { color: '#8b6914', width: 2 },
      diagonals: {
        predicate: (r, c) => (r + c) % 2 === 0,
        color: '#8b6914',
        width: 1.5,
      },
    })

    const diagLines = result.elements.filter(e =>
      e.tag === 'line' && e.attrs.x1 !== e.attrs.x2 && e.attrs.y1 !== e.attrs.y2
    )
    // 4 rows × 8 cols = 32 cells; alternating pattern means ~half get diagonals
    // Each qualifying cell gets 2 lines (forward + backward)
    expect(diagLines.length).toBeGreaterThan(0)
    expect(diagLines.length % 2).toBe(0) // always pairs
  })

  test('diagonal lines with predicate covering all cells', () => {
    const grid5x5 = createGridTopology({ rows: 5, cols: 5 })
    const result = grid5x5.renderLayout({
      tileSize: 40,
      positionType: 'intersection',
      showLabels: false,
      inset: 20,
      lines: { color: '#333', width: 1 },
      diagonals: {
        predicate: () => true,
        color: '#333',
        width: 1,
      },
    })

    const diagLines = result.elements.filter(e =>
      e.tag === 'line' && e.attrs.x1 !== e.attrs.x2 && e.attrs.y1 !== e.attrs.y2
    )
    expect(diagLines.length).toBe(32) // 4×4 cells × 2 diagonals each
  })

  test('paths rendered (arcs)', () => {
    const grid6 = createGridTopology({ rows: 6, cols: 6 })
    const result = grid6.renderLayout({
      tileSize: 50,
      positionType: 'intersection',
      showLabels: false,
      inset: 115,
      backgrounds: [
        { fill: '#5a3e28', rx: 8 },
        { x: 30, y: 30, width: 320, height: 320, fill: '#c8a872', rx: 5 },
      ],
      lines: { color: '#6b4a30', width: 1.5 },
      markers: Array.from({ length: 36 }, (_, i) => [Math.floor(i / 6), i % 6]),
      paths: [
        { d: 'M 50,0 A 50,50 0 1,0 0,50', stroke: '#6b4a30', strokeWidth: 2.5 },
        { d: 'M 100,0 A 100,100 0 1,0 0,100', stroke: '#6b4a30', strokeWidth: 2.5 },
      ],
    })

    const pathEls = result.elements.filter(e => e.tag === 'path')
    expect(pathEls.length).toBe(2)
    expect(pathEls[0].attrs.stroke).toBe('#6b4a30')
  })

  test('zone highlights rendered', () => {
    const grid9 = createGridTopology({ rows: 9, cols: 9 })
    const result = grid9.renderLayout({
      tileSize: 40,
      positionType: 'intersection',
      showLabels: false,
      inset: 20,
      backgrounds: [{ fill: '#e8c97a' }],
      lines: { color: '#6b4e1a', width: 0.8 },
      zones: [
        { fromRow: 0, toRow: 2, fromCol: 0, toCol: 8, fill: 'rgba(180, 60, 40, 0.08)' },
        { fromRow: 6, toRow: 8, fromCol: 0, toCol: 8, fill: 'rgba(180, 60, 40, 0.08)' },
      ],
    })

    const zoneRects = result.elements.filter(e => e.tag === 'rect' && e.attrs.fill?.startsWith('rgba'))
    expect(zoneRects.length).toBe(2)
  })

  test('texts rendered at arbitrary positions', () => {
    const grid10x9 = createGridTopology({ rows: 10, cols: 9 })
    const result = grid10x9.renderLayout({
      tileSize: 40,
      positionType: 'intersection',
      showLabels: false,
      inset: 20,
      lines: { color: '#333', width: 1, splitAfterRow: 4 },
      texts: [
        { x: 100, y: 200, text: '楚 河', fontSize: 14, fontFamily: 'serif', fill: '#4a3520' },
        { x: 260, y: 200, text: '漢 界', fontSize: 14, fontFamily: 'serif', fill: '#4a3520' },
      ],
    })

    const textEls = result.elements.filter(e => e.tag === 'text')
    expect(textEls.length).toBe(2)
    expect(textEls[0].text).toBe('楚 河')
    expect(textEls[1].text).toBe('漢 界')
  })

  test('labels with custom alphabet (skip I)', () => {
    const grid19 = createGridTopology({ rows: 19, cols: 19 })
    const goAlphabet = 'ABCDEFGHJKLMNOPQRST'.split('')
    const result = grid19.renderLayout({
      tileSize: 20,
      positionType: 'intersection',
      showLabels: true,
      inset: 15,
      lines: { color: '#333', width: 0.8 },
      labels: { alphabet: goAlphabet, fontFamily: 'sans-serif', color: '#5a4020' },
    })

    const fileLabels = result.labels.filter(l => l.text.length === 1 && l.text >= 'A')
    expect(fileLabels.map(l => l.text)).not.toContain('I')
    expect(fileLabels[0].text).toBe('A')
    expect(fileLabels[8].text).toBe('J')
    expect(result.cells[0].id).toBe('A19') // uses alphabet for cell IDs too
  })

  test('no game names, no provider names, no mode branches in output', () => {
    // This test verifies the API shape — config is primitives, not modes
    const grid5 = createGridTopology({ rows: 5, cols: 5 })
    const config = {
      tileSize: 40,
      positionType: 'intersection',
      showLabels: false,
      inset: 20,
      backgrounds: [{ fill: '#ccc' }],
      lines: { color: '#333', width: 1 },
      diagonals: { predicate: (r, c) => (r + c) % 2 === 0, color: '#333', width: 1 },
      markers: [[2, 2]],
      zones: [{ fromRow: 0, toRow: 1, fromCol: 0, toCol: 4, fill: 'rgba(0,0,255,0.1)' }],
      paths: [{ d: 'M 0,0 L 10,10', stroke: '#333' }],
      texts: [{ x: 50, y: 50, text: 'test', fontSize: 10 }],
    }
    // All primitives work together in a single call — no separate "modes"
    const result = grid5.renderLayout(config)
    expect(result.elements.length).toBeGreaterThan(0)
    expect(result.cells.length).toBe(25)
  })
})
