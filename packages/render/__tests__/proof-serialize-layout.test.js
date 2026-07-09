import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { serializeLayout } from '../src/serialize-layout.js'

describe('proof: renderLayout → serializeLayout produces valid SVG', () => {
  test('mono-grid 8x8 (Reversi) produces complete SVG', () => {
    const grid = createGridTopology({ rows: 8, cols: 8 })
    const layout = grid.renderLayout({
      tileSize: 40,
      mode: 'tiles',
      cellColor: 'uniform',
      colors: { mono: '#2e7d32', gridLine: '#1b5e20' },
      showLabels: false,
    })

    const svg = serializeLayout(layout, { title: 'Reversi' })

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 320 320"')
    expect(svg).toContain('<title>Reversi</title>')
    expect(svg).toContain('fill="#2e7d32"')
    expect(svg).toContain('stroke="#1b5e20"')
    expect(svg).toContain('data-sq="a8"')
    expect(svg).toContain('data-sq="h1"')
    expect(svg).toContain('</svg>')
  })

  test('intersection grid 19x19 (Go) with star points', () => {
    const grid = createGridTopology({ rows: 19, cols: 19 })
    const layout = grid.renderLayout({
      tileSize: 20,
      mode: 'intersections',
      colors: { background: '#dcb35c', surface: '#d4a843', gridLine: '#3d2b1a' },
      showLabels: true,
      inset: 15,
      labelStyle: 'go',
      markers: [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]],
    })

    const svg = serializeLayout(layout)

    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#dcb35c"')
    expect(svg).toContain('fill="#d4a843"')
    expect(svg).toContain('stroke="#3d2b1a"')

    const starCircles = (svg.match(/r="3"/g) || []).length
    expect(starCircles).toBe(9)

    expect(svg).toContain('>A<')
    expect(svg).toContain('>J<')
    expect(svg).not.toContain('>I<')
  })

  test('checkered grid with labels (Chess standard)', () => {
    const grid = createGridTopology({ rows: 8, cols: 8 })
    const layout = grid.renderLayout({
      tileSize: 56,
      mode: 'tiles',
      cellColor: 'checkered',
      colors: { light: '#f0d9b5', dark: '#b58863', labelText: '#5a4020' },
      showLabels: true,
    })

    const svg = serializeLayout(layout)

    expect(svg).toContain('viewBox="0 0 496 496"') // 448 + 48 padding
    expect(svg).toContain('fill="#f0d9b5"')
    expect(svg).toContain('fill="#b58863"')
    expect(svg).toContain('>a<')
    expect(svg).toContain('>h<')
    expect(svg).toContain('>1<')
    expect(svg).toContain('>8<')
  })

  test('xiangqi intersection grid with river + palaces', () => {
    const grid = createGridTopology({ rows: 10, cols: 9 })
    const layout = grid.renderLayout({
      tileSize: 40,
      mode: 'intersections',
      colors: { background: '#f5e6c8', gridLine: '#333' },
      showLabels: false,
      inset: 20,
      riverAfterRow: 4,
      riverHeight: 20,
      palaces: [
        { row: 0, col: 3, width: 2, height: 2 },
        { row: 7, col: 3, width: 2, height: 2 },
      ],
      decorations: [
        { type: 'river-text', texts: ['楚 河', '漢 界'], positions: [0.25, 0.75], fontFamily: 'serif' },
      ],
    })

    const svg = serializeLayout(layout)

    expect(svg).toContain('楚 河')
    expect(svg).toContain('漢 界')
    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('data-sq=')
    expect(layout.cells.length).toBe(90) // 10x9
  })
})
