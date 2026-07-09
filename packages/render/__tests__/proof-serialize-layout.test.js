import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { serializeLayout } from '../src/serialize-layout.js'

describe('proof: renderLayout → serializeLayout produces valid SVG', () => {
  test('mono-grid 8x8 (uniform fill) produces complete SVG', () => {
    const grid = createGridTopology({ rows: 8, cols: 8 })
    const layout = grid.renderLayout({
      tileSize: 40,
      positionType: 'square',
      showLabels: false,
      backgrounds: [{ fill: '#2e7d32' }],
      lines: { color: '#1b5e20', width: 1.5 },
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

  test('intersection grid 19x19 with star points', () => {
    const grid = createGridTopology({ rows: 19, cols: 19 })
    const goAlphabet = 'ABCDEFGHJKLMNOPQRST'.split('')
    const layout = grid.renderLayout({
      tileSize: 20,
      positionType: 'intersection',
      showLabels: true,
      inset: 15,
      backgrounds: [
        { fill: '#dcb35c' },
        { x: 39, y: 39, width: 360, height: 360, fill: '#d4a843', rx: 2 },
      ],
      lines: { color: '#3d2b1a', width: 0.8 },
      markers: [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]],
      labels: { alphabet: goAlphabet, fontFamily: 'sans-serif', color: '#5a4020' },
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

  test('checkered grid with labels (cellFill function)', () => {
    const grid = createGridTopology({ rows: 8, cols: 8 })
    const layout = grid.renderLayout({
      tileSize: 56,
      positionType: 'square',
      showLabels: true,
      cellFill: (r, c) => (r + c) % 2 === 0 ? '#f0d9b5' : '#b58863',
      lines: { horizontal: false },
      labels: { color: '#5a4020' },
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

  test('intersection grid with split lines + texts', () => {
    const grid = createGridTopology({ rows: 10, cols: 9 })
    const layout = grid.renderLayout({
      tileSize: 40,
      positionType: 'intersection',
      showLabels: false,
      inset: 20,
      backgrounds: [{ fill: '#f5e6c8' }],
      lines: { color: '#333', width: 1, splitAfterRow: 4 },
      diagonals: {
        predicate: (r, c) => (r >= 0 && r <= 2 && c >= 3 && c <= 5) || (r >= 7 && r <= 9 && c >= 3 && c <= 5),
        color: '#333',
        width: 0.8,
      },
      texts: [
        { x: 100, y: 200, text: '楚 河', fontSize: 14, fontFamily: 'serif', fill: '#4a3520' },
        { x: 260, y: 200, text: '漢 界', fontSize: 14, fontFamily: 'serif', fill: '#4a3520' },
      ],
    })

    const svg = serializeLayout(layout)

    expect(svg).toContain('楚 河')
    expect(svg).toContain('漢 界')
    expect(svg).toContain('data-sq=')
    expect(layout.cells.length).toBe(90) // 10x9
  })
})
