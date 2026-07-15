import { createHexTopology } from '../src/topology-hex.js'

describe('topology-hex renderLayout', () => {
  describe('hexagonal shape (radius 2)', () => {
    const topo = createHexTopology({ radius: 2 })

    it('returns structured layout with expected shape', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        scale: 0.95,
        background: { fill: '#2c2c2c', rx: 6 },
        cellFill: (q, r) => '#f0d9b5',
        cellStroke: { color: 'rgba(0,0,0,0.2)', width: 1 },
      })

      expect(layout).toHaveProperty('width')
      expect(layout).toHaveProperty('height')
      expect(layout).toHaveProperty('elements')
      expect(layout).toHaveProperty('cells')
      expect(layout).toHaveProperty('labels')
      expect(layout).toHaveProperty('defs')
      expect(layout.width).toBeGreaterThan(0)
      expect(layout.height).toBeGreaterThan(0)
    })

    it('produces background rect when background is specified', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        background: { fill: '#2c2c2c', rx: 6 },
        cellFill: () => '#ccc',
      })

      const bgs = layout.elements.filter(e => e.tag === 'rect' && e.attrs.fill === '#2c2c2c')
      expect(bgs.length).toBe(1)
      expect(bgs[0].attrs.rx).toBe(6)
    })

    it('produces no background when background is null', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        background: null,
        cellFill: () => '#ccc',
      })

      const rects = layout.elements.filter(e => e.tag === 'rect')
      expect(rects.length).toBe(0)
    })

    it('produces one polygon per hex cell', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        cellFill: () => '#aaa',
      })

      const polys = layout.elements.filter(e => e.tag === 'polygon')
      expect(polys.length).toBe(topo.getCellCount())
    })

    it('applies cellFill function to each polygon', () => {
      const colorFn = (q, r) => {
        const mod = (((q - r) % 3) + 3) % 3
        return mod === 0 ? '#light' : mod === 1 ? '#mid' : '#dark'
      }
      const layout = topo.renderLayout({ cellSize: 30, cellFill: colorFn })

      const polys = layout.elements.filter(e => e.tag === 'polygon')
      const fills = new Set(polys.map(p => p.attrs.fill))
      expect(fills.size).toBe(3)
      expect(fills.has('#light')).toBe(true)
      expect(fills.has('#mid')).toBe(true)
      expect(fills.has('#dark')).toBe(true)
    })

    it('produces hit targets matching cell count', () => {
      const layout = topo.renderLayout({ cellSize: 30, cellFill: () => '#ccc' })

      expect(layout.cells.length).toBe(topo.getCellCount())
      for (const cell of layout.cells) {
        expect(cell).toHaveProperty('id')
        expect(cell).toHaveProperty('x')
        expect(cell).toHaveProperty('y')
        expect(cell.element.tag).toBe('polygon')
        expect(cell.element.attrs.fill).toBe('transparent')
        expect(cell.element.attrs['data-sq']).toBe(cell.id)
        expect(cell.element.attrs.class).toContain('board-cell')
      }
    })

    it('cell ids are axial coordinate strings', () => {
      const layout = topo.renderLayout({ cellSize: 30, cellFill: () => '#ccc' })
      const ids = layout.cells.map(c => c.id)
      expect(ids).toContain('0,0')
      expect(ids).toContain('1,0')
      expect(ids).toContain('0,-1')
    })
  })

  describe('border frame', () => {
    const topo = createHexTopology({ radius: 2 })

    it('produces line elements for frame edges', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        frame: { stroke: '#6b4226', strokeWidth: 14 },
        cellFill: () => '#ccc',
      })

      const lines = layout.elements.filter(e => e.tag === 'line')
      expect(lines.length).toBeGreaterThan(0)
      expect(lines[0].attrs.stroke).toBe('#6b4226')
      expect(lines[0].attrs['stroke-width']).toBe(14)
    })

    it('frame and background are mutually exclusive (frame wins)', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        background: null,
        frame: { stroke: '#333', strokeWidth: 10 },
        cellFill: () => '#ccc',
      })

      const rects = layout.elements.filter(e => e.tag === 'rect')
      expect(rects.length).toBe(0)
      const lines = layout.elements.filter(e => e.tag === 'line')
      expect(lines.length).toBeGreaterThan(0)
    })
  })

  describe('overlays', () => {
    const topo = createHexTopology({ radius: 2 })

    it('renders overlay circles at specified positions', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        cellFill: () => '#ccc',
        overlays: [
          { q: 0, r: 0, color: '#C62828', text: '6' },
          { q: 1, r: 0, color: '#1565C0', text: '8' },
        ],
      })

      const circles = layout.elements.filter(e => e.tag === 'circle')
      expect(circles.length).toBe(2)
      const texts = layout.elements.filter(e => e.tag === 'text' && (e.text === '6' || e.text === '8'))
      expect(texts.length).toBe(2)
    })
  })

  describe('centre marker', () => {
    const topo = createHexTopology({ radius: 3 })

    it('renders centre marker text at specified cell', () => {
      const layout = topo.renderLayout({
        cellSize: 22,
        cellFill: () => '#ccc',
        centreMarker: { q: 0, r: 0, text: '★', fill: 'gold' },
      })

      const markers = layout.elements.filter(e => e.tag === 'text' && e.text === '★')
      expect(markers.length).toBe(1)
      expect(markers[0].attrs.fill).toBe('gold')
    })
  })

  describe('rhombus shape', () => {
    const topo = createHexTopology({ size: 5, shape: 'rhombus' })

    it('produces correct cell count for rhombus', () => {
      const layout = topo.renderLayout({ cellSize: 20, cellFill: () => '#ccc' })

      const polys = layout.elements.filter(e => e.tag === 'polygon')
      expect(polys.length).toBe(25)
      expect(layout.cells.length).toBe(25)
    })

    it('frame edges form rhombus perimeter', () => {
      const layout = topo.renderLayout({
        cellSize: 20,
        frame: { stroke: '#333', strokeWidth: 10 },
        cellFill: () => '#ccc',
      })

      const lines = layout.elements.filter(e => e.tag === 'line')
      expect(lines.length).toBeGreaterThan(0)
    })
  })

  describe('flat orientation', () => {
    const topo = createHexTopology({ radius: 3, orientation: 'flat' })

    it('produces valid layout with flat-top hexes', () => {
      const layout = topo.renderLayout({
        cellSize: 22,
        cellFill: () => '#f0d9b5',
      })

      expect(layout.cells.length).toBe(topo.getCellCount())
      const polys = layout.elements.filter(e => e.tag === 'polygon')
      expect(polys.length).toBe(topo.getCellCount())
    })
  })

  describe('explicit hex array', () => {
    const topo = createHexTopology({ radius: 5 })

    it('accepts custom hex array overriding topology cells', () => {
      const customHexes = [
        { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 },
        { q: 1, r: 1 }, { q: 2, r: 0 },
      ]
      const layout = topo.renderLayout({
        hexes: customHexes,
        cellSize: 30,
        cellFill: () => '#abc',
      })

      const polys = layout.elements.filter(e => e.tag === 'polygon')
      expect(polys.length).toBe(5)
      expect(layout.cells.length).toBe(5)
    })
  })

  describe('cell images with clip paths', () => {
    const topo = createHexTopology({ radius: 2 })

    it('produces clip defs and image elements', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        cellFill: () => '#ccc',
        cellImage: (q, r) => q === 0 && r === 0 ? '/tiles/forest.png' : null,
      })

      expect(layout.defs.length).toBe(1)
      expect(layout.defs[0].tag).toBe('clipPath')
      expect(layout.defs[0].attrs.id).toBe('clip-0-0')
      const images = layout.elements.filter(e => e.tag === 'image')
      expect(images.length).toBe(1)
      expect(images[0].attrs.href).toBe('/tiles/forest.png')
    })
  })

  describe('cell labels', () => {
    const topo = createHexTopology({ radius: 2 })

    it('renders text labels for cells with labels', () => {
      const layout = topo.renderLayout({
        cellSize: 30,
        cellFill: () => '#ccc',
        cellLabel: (q, r) => q === 0 && r === 0 ? 'CTR' : null,
      })

      const texts = layout.elements.filter(e => e.tag === 'text' && e.text === 'CTR')
      expect(texts.length).toBe(1)
    })
  })
})
