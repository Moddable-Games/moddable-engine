import { createBoardRenderer } from '../src/board-renderer.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createHexTopology } from '../../topology-hex/src/topology-hex.js'
import { createTrackTopology } from '../../topology-track/src/topology-track.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'

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

    test('cells have rect shape', () => {
      expect(layout.getCells()[0].shape).toBe('rect')
    })

    test('alternating fills', () => {
      const cells = layout.getCells()
      expect(cells[0].fill).not.toBe(cells[1].fill)
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

    test('cells have hex shape with 6 corners', () => {
      const cell = layout.getCells()[0]
      expect(cell.shape).toBe('hex')
      expect(cell.corners).toHaveLength(6)
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

    test('cells have pit shape', () => {
      expect(layout.getCells().every(c => c.shape === 'pit')).toBe(true)
    })

    test('stores are larger', () => {
      const cells = layout.getCells()
      const stores = cells.filter(c => c.radius === 35)
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
  })
})
