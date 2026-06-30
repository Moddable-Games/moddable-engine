import { createBoardRenderer } from '../src/board-renderer.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createHexTopology } from '../../topology-hex/src/topology-hex.js'
import { createTrackTopology } from '../../topology-track/src/topology-track.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'
import { createBoard, builtinBoards } from '../../board-layout/index.js'

describe('board-renderer — topology-agnostic', () => {
  const renderer = createBoardRenderer()

  describe('grid topology provides layout', () => {
    const topology = createGridTopology({ rows: 8, cols: 8 })
    const layout = topology.getLayout()

    test('produces valid SVG', () => {
      const svg = renderer.render(layout, { colors: { background: '#fff' } })
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    })

    test('has 64 cells', () => {
      expect(layout.getCells()).toHaveLength(64)
    })

    test('cells declare rect element', () => {
      expect(layout.getCells()[0].element).toBe('rect')
    })

    test('alternating cell types', () => {
      const cells = layout.getCells()
      expect(cells[0].cellType).toBe('light')
      expect(cells[1].cellType).toBe('dark')
    })

    test('renders with pieces', () => {
      const svg = renderer.render(layout, {
        pieces: { 0: { color: 'black', label: 'R' } },
      })
      expect(svg).toContain('class="pieces"')
      expect(svg).toContain('>R<')
    })
  })

  describe('hex topology provides layout', () => {
    const topology = createHexTopology({ radius: 3 })
    const layout = topology.getLayout()

    test('produces valid SVG', () => {
      const svg = renderer.render(layout)
      expect(svg).toContain('<svg')
    })

    test('has 37 cells', () => {
      expect(layout.getCells()).toHaveLength(37)
    })

    test('cells declare polygon element with points attr', () => {
      const cell = layout.getCells()[0]
      expect(cell.element).toBe('polygon')
      expect(cell.attrs.points).toBeDefined()
      expect(cell.attrs.points.split(' ')).toHaveLength(6)
    })

    test('SVG contains polygon elements', () => {
      const svg = renderer.render(layout)
      expect(svg).toContain('<polygon')
    })
  })

  describe('track topology provides layout', () => {
    const topology = createTrackTopology({
      positions: Array.from({ length: 24 }, (_, i) => `point-${i + 1}`),
      circuit: false,
    })
    const layout = topology.getLayout()

    test('produces valid SVG', () => {
      const svg = renderer.render(layout)
      expect(svg).toContain('<svg')
    })

    test('has 24 cells', () => {
      expect(layout.getCells()).toHaveLength(24)
    })

    test('connecting lines', () => {
      expect(layout.getLines()).toHaveLength(23)
    })

    test('circuit topology wraps connection', () => {
      const circuitTopo = createTrackTopology({
        positions: Array.from({ length: 10 }, (_, i) => `pos-${i}`),
        circuit: true,
      })
      const circuitLayout = circuitTopo.getLayout({ style: 'circuit' })
      const lines = circuitLayout.getLines()
      expect(lines.length).toBeGreaterThanOrEqual(9)
      const last = lines[lines.length - 1]
      const first = circuitLayout.getCells()[0]
      expect(last.x2).toBe(first.center.x)
      expect(last.y2).toBe(first.center.y)
    })
  })

  describe('pit topology provides layout', () => {
    const topology = createPitTopology({ pitsPerSide: 6, players: 2, hasStores: true })
    const layout = topology.getLayout()

    test('produces valid SVG', () => {
      const svg = renderer.render(layout)
      expect(svg).toContain('<svg')
    })

    test('has 14 cells (12 pits + 2 stores)', () => {
      expect(layout.getCells()).toHaveLength(14)
    })

    test('cells declare ellipse element', () => {
      expect(layout.getCells().every(c => c.element === 'ellipse')).toBe(true)
    })

    test('stores have larger rx', () => {
      const cells = layout.getCells()
      const stores = cells.filter(c => c.attrs.rx === 35)
      expect(stores).toHaveLength(2)
    })
  })

  describe('renderer is topology-agnostic', () => {
    test('same renderer renders all four topologies via getLayout()', () => {
      const gridSvg = renderer.render(createGridTopology({ rows: 3, cols: 3 }).getLayout())
      const hexSvg = renderer.render(createHexTopology({ radius: 2 }).getLayout())
      const trackSvg = renderer.render(createTrackTopology({ positions: ['a', 'b', 'c'], circuit: false }).getLayout())
      const pitSvg = renderer.render(createPitTopology({ pitsPerSide: 4, players: 2, hasStores: true }).getLayout())

      expect(gridSvg).toContain('<svg')
      expect(hexSvg).toContain('<svg')
      expect(trackSvg).toContain('<svg')
      expect(pitSvg).toContain('<svg')
    })

    test('all cells provide element + attrs (no shape strings)', () => {
      const layouts = [
        createGridTopology({ rows: 3, cols: 3 }).getLayout(),
        createHexTopology({ radius: 2 }).getLayout(),
        createTrackTopology({ positions: ['a', 'b'], circuit: false }).getLayout(),
        createPitTopology({ pitsPerSide: 4, players: 2, hasStores: false }).getLayout(),
      ]
      for (const layout of layouts) {
        for (const cell of layout.getCells()) {
          expect(cell.element).toBeDefined()
          expect(cell.attrs).toBeDefined()
          expect(cell.center).toBeDefined()
        }
      }
    })
  })

  describe('board + topology layer composition', () => {
    const renderer = createBoardRenderer({ padding: 10 })

    test('renders board elements before topology cells', () => {
      const board = createBoard(builtinBoards.capsule({
        width: 520,
        height: 180,
        frameColor: '#7A5A32',
        surfaceColor: '#9B7740',
      }))
      const topology = createPitTopology({ pitsPerSide: 6, players: 2, hasStores: true })
      const layout = topology.getLayout()
      const svg = renderer.render(layout, { board })
      const frameIdx = svg.indexOf('fill="#7A5A32"')
      const surfaceIdx = svg.indexOf('fill="#9B7740"')
      const cellIdx = svg.indexOf('<ellipse')
      expect(frameIdx).toBeLessThan(surfaceIdx)
      expect(surfaceIdx).toBeLessThan(cellIdx)
    })

    test('board dimensions drive SVG size', () => {
      const board = createBoard(builtinBoards.rectangle({
        width: 500,
        height: 400,
        frameWidth: 20,
        surfaceColor: '#eee',
      }))
      const topology = createGridTopology({ rows: 3, cols: 3 })
      const layout = topology.getLayout()
      const svg = renderer.render(layout, { board })
      expect(svg).toContain('width="520"')
      expect(svg).toContain('height="420"')
    })

    test('topology offset by surface bounds', () => {
      const board = createBoard(builtinBoards.rectangle({
        width: 400,
        height: 400,
        frameWidth: 30,
        surfaceColor: '#fff',
      }))
      const topology = createGridTopology({ rows: 2, cols: 2 })
      const layout = topology.getLayout()
      const svg = renderer.render(layout, { board })
      expect(svg).toContain('translate(30,30)')
    })

    test('works without board (backward compatible)', () => {
      const topology = createGridTopology({ rows: 3, cols: 3 })
      const layout = topology.getLayout()
      const svg = renderer.render(layout, { colors: { background: '#fff' } })
      expect(svg).toContain('<svg')
      expect(svg).toContain('translate(0,0)')
    })

    test('split board renders two surfaces and divider', () => {
      const board = createBoard(builtinBoards.split({
        width: 440,
        height: 320,
        frameWidth: 16,
        barWidth: 24,
        frameColor: '#3d2b1f',
        surfaceColor: '#1a5c3a',
      }))
      const topology = createTrackTopology({
        positions: Array.from({ length: 24 }, (_, i) => `p${i}`),
      })
      const layout = topology.getLayout()
      const svg = renderer.render(layout, { board })
      const surfaceCount = (svg.match(/fill="#1a5c3a"/g) || []).length
      expect(surfaceCount).toBe(2)
      expect(svg).toContain('fill="#3d2b1f"')
    })

    test('slab board (Go style) has no frame element', () => {
      const board = createBoard(builtinBoards.slab({
        width: 438,
        height: 438,
        borderWidth: 24,
        surfaceInset: 15,
        slabColor: '#dcb35c',
        surfaceColor: '#d4a843',
      }))
      const topology = createGridTopology({ rows: 9, cols: 9 })
      const layout = topology.getLayout()
      const svg = renderer.render(layout, { board })
      expect(svg).toContain('fill="#dcb35c"')
      expect(svg).toContain('fill="#d4a843"')
    })

    test('felt board (card table) works with no topology cells', () => {
      const board = createBoard(builtinBoards.felt({
        width: 600,
        height: 400,
        feltColor: '#1a5c3a',
        edgeColor: '#0d3d1f',
      }))
      const emptyLayout = {
        getDimensions: () => ({ width: 0, height: 0 }),
        getCells: () => [],
      }
      const svg = renderer.render(emptyLayout, { board })
      expect(svg).toContain('fill="#1a5c3a"')
      expect(svg).toContain('<svg')
    })
  })
})
