import { produceLayout } from '../src/produce-layout.js'

describe('produceLayout', () => {
  describe('grid topology', () => {
    test('standard chess — checkered 8x8', () => {
      const engine = {
        topology: { type: 'grid', rows: 8, cols: 8 },
        surface: 'wood-classic',
        render: { cellSize: 40, cellColor: 'checkered', labels: true },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('grid')
      expect(result.rows).toBe(8)
      expect(result.cols).toBe(8)
      expect(result.config.tileSize).toBe(40)
      expect(result.config.positionType).toBe('square')
      expect(result.config.showLabels).toBe(true)
      expect(result.config.cellFill).toBeInstanceOf(Function)
      expect(result.config.cellFill(0, 0)).toBe('#f0d9b5')
      expect(result.config.cellFill(0, 1)).toBe('#b58863')
      expect(result.config.backgrounds).toEqual([])
      expect(result.config.lines).toEqual({ horizontal: false })
    })

    test('go — intersections 19x19', () => {
      const engine = {
        topology: { type: 'grid', rows: 19, cols: 19, layout: 'intersections' },
        surface: 'wood-light',
        render: { cellSize: 20, cellColor: 'uniform', labels: true },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('grid')
      expect(result.rows).toBe(19)
      expect(result.cols).toBe(19)
      expect(result.config.positionType).toBe('intersection')
      expect(result.config.inset).toBe(10)
      expect(result.config.backgrounds).toHaveLength(1)
      expect(result.config.backgrounds[0].fill).toBe('#dcb35c')
      expect(result.config.lines.color).toBe('#2a2a2a')
      expect(result.config.lines.width).toBe(2)
    })

    test('uniform cellColor fills all cells the same', () => {
      const engine = {
        topology: { type: 'grid', rows: 8, cols: 8 },
        surface: 'felt-green',
        render: { cellSize: 40, cellColor: 'uniform' },
      }
      const result = produceLayout(engine)
      expect(result.config.cellFill(0, 0)).toBe('#2e7d32')
      expect(result.config.cellFill(0, 1)).toBe('#2e7d32')
      expect(result.config.cellFill(3, 5)).toBe('#2e7d32')
    })

    test('no cellColor means no cellFill', () => {
      const engine = {
        topology: { type: 'grid', rows: 6, cols: 6, layout: 'intersections' },
        surface: 'parchment',
        render: { cellSize: 40, cellColor: 'none' },
      }
      const result = produceLayout(engine)
      expect(result.config.cellFill).toBeNull()
    })

    test('star points auto-computed for 19x19', () => {
      const engine = {
        topology: { type: 'grid', rows: 19, cols: 19, layout: 'intersections' },
        surface: 'wood-light',
        render: {
          cellSize: 20,
          cellColor: 'none',
          decorations: [{ type: 'markers', auto: 'star-points', size: 4 }],
        },
      }
      const result = produceLayout(engine)
      expect(result.config.markers).toHaveLength(9)
      expect(result.config.markers[0]).toEqual({ r: 3, c: 3, radius: 4 })
    })

    test('explicit marker positions', () => {
      const engine = {
        topology: { type: 'grid', rows: 9, cols: 9, layout: 'intersections' },
        surface: 'wood-light',
        render: {
          cellSize: 20,
          decorations: [{ type: 'markers', at: [[2,2],[4,4],[6,6]], size: 3 }],
        },
      }
      const result = produceLayout(engine)
      expect(result.config.markers).toHaveLength(3)
      expect(result.config.markers[1]).toEqual({ r: 4, c: 4, radius: 3 })
    })

    test('labels disabled', () => {
      const engine = {
        topology: { type: 'grid', rows: 8, cols: 8 },
        surface: 'wood-classic',
        render: { cellSize: 40, labels: false },
      }
      const result = produceLayout(engine)
      expect(result.config.showLabels).toBe(false)
    })
  })

  describe('hex topology', () => {
    test('standard hex — rhombus 11x11 produces ops', () => {
      const engine = {
        topology: { type: 'hex', shape: 'rhombus', rows: 11, cols: 11, orientation: 'pointy' },
        surface: 'slate',
        render: { cellSize: 20, cellColor: 'uniform', frame: 'rhombus' },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('hex')
      expect(Array.isArray(result.config.ops)).toBe(true)
      expect(result.config.width).toBeGreaterThan(0)
      expect(result.config.height).toBeGreaterThan(0)
      const cells = result.config.ops.filter(o => o.attrs?.['data-sq'])
      expect(cells.length).toBe(121)
    })

    test('hexagonal shape with tricolor produces coloured cells', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5, orientation: 'flat' },
        surface: 'wood-classic',
        render: { cellSize: 22, cellColor: 'tricolor' },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('hex')
      const cells = result.config.ops.filter(o => o.attrs?.['data-sq'])
      expect(cells.length).toBe(91)
      const fills = new Set(cells.map(c => c.attrs.fill))
      expect(fills.size).toBe(3)
    })

    test('bicolor (ring-based) produces alternating fills', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5 },
        surface: 'slate',
        render: { cellSize: 22, cellColor: 'rings' },
      }
      const result = produceLayout(engine)
      const cells = result.config.ops.filter(o => o.attrs?.['data-sq'])
      const fills = new Set(cells.map(c => c.attrs.fill))
      expect(fills.size).toBe(2)
    })

    test('no explicit frame but shape present = frame derived from shape', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5 },
        surface: 'wood-classic',
        render: { cellSize: 22 },
      }
      const result = produceLayout(engine)
      expect(result.config.ops.length).toBeGreaterThan(0)
      expect(result.config.width).toBeGreaterThan(0)
      expect(result.config.height).toBeGreaterThan(0)
    })

    test('centre marker', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5 },
        surface: 'slate',
        render: { cellSize: 22, centreMarker: '★' },
      }
      const result = produceLayout(engine)
      const texts = result.config.ops.filter(o => o.tag === 'text')
      expect(texts.length).toBeGreaterThan(0)
      expect(texts[0].text).toBe('★')
    })

    test('triangular shape produces cells', () => {
      const engine = {
        topology: { type: 'hex', shape: 'triangular', sideLength: 12 },
        surface: 'slate',
        render: { cellSize: 18 },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('hex')
      expect(Array.isArray(result.config.ops)).toBe(true)
      const cells = result.config.ops.filter(o => o.attrs?.['data-sq'])
      expect(cells.length).toBeGreaterThan(0)
    })
  })

  describe('track topology', () => {
    test('backgammon — triangular points produces ops', () => {
      const engine = {
        topology: { type: 'track', positions: 24 },
        surface: 'parchment',
        render: { trackStyle: 'triangular-points' },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('track')
      expect(result.config.style).toBe('points')
      expect(Array.isArray(result.config.ops)).toBe(true)
      const points = result.config.ops.filter(o => o.attrs && String(o.attrs['data-sq'] || '').startsWith('point-'))
      expect(points.length).toBe(24)
      expect(result.config.height).toBe(320)
      expect(result.config.width).toBe(16 * 2 + 32 * 6 * 2 + 24)
    })

    test('backgammon — checker stacks from parsed setup', () => {
      const engine = {
        topology: { type: 'track', positions: 24 },
        surface: 'parchment',
        render: { trackStyle: 'triangular-points', _parsedSetup: { dark: { 0: 2 }, light: { 23: 7 } } },
      }
      const result = produceLayout(engine)
      const circles = result.config.ops.filter(o => o.tag === 'circle')
      const overflowTexts = result.config.ops.filter(o => o.tag === 'text')
      expect(circles.length).toBe(2 + 5) // 2 dark + 5 shown of 7 light
      expect(overflowTexts.length).toBe(1) // overflow count on the 7-stack
    })

    test('perimeter — landlords produces ops from board data', () => {
      const engine = {
        topology: { type: 'track', positions: 40 },
        surface: 'parchment',
        render: {
          trackStyle: 'perimeter',
          _board: 'test-board',
          _boardData: { boards: { 'test-board': { totalSpaces: 8, spaces: [
            { pos: 0, side: 'corner', name: 'GO', type: 'corner' },
            { pos: 1, side: 'bottom', name: 'A', type: 'lot' },
            { pos: 2, side: 'corner', name: 'JAIL', type: 'corner' },
            { pos: 3, side: 'left', name: 'B', type: 'lot' },
            { pos: 4, side: 'corner', name: 'FREE', type: 'corner' },
            { pos: 5, side: 'top', name: 'C', type: 'lot' },
            { pos: 6, side: 'corner', name: 'GTJ', type: 'corner' },
            { pos: 7, side: 'right', name: 'D', type: 'lot' },
          ] } } },
        },
      }
      const result = produceLayout(engine)
      expect(result.config.style).toBe('perimeter')
      const cells = result.config.ops.filter(o => o.attrs && String(o.attrs['data-sq'] || '').startsWith('pos-'))
      expect(cells.length).toBe(8) // 4 corners + 4 side spaces
    })

    test('perimeter — no board data fallback', () => {
      const engine = {
        topology: { type: 'track', positions: 40 },
        surface: 'parchment',
        render: { trackStyle: 'perimeter' },
      }
      const result = produceLayout(engine)
      expect(result.config.ops.length).toBe(2) // fallback rect + message
    })
  })

  describe('pit topology', () => {
    test('mancala — standard 2-row 6-pit produces ops', () => {
      const engine = {
        topology: { type: 'pit', rows: 2, cols: 6, stores: true },
        surface: 'earth',
        render: {},
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('pit')
      expect(Array.isArray(result.config.ops)).toBe(true)
      expect(result.config.width).toBeGreaterThan(0)
      expect(result.config.height).toBeGreaterThan(0)
      // 2 board rects + 2 stores + 12 pits + seeds
      const pits = result.config.ops.filter(o => o.attrs && String(o.attrs['data-sq'] || '').startsWith('pit-'))
      const stores = result.config.ops.filter(o => o.attrs && String(o.attrs['data-sq'] || '').startsWith('store-'))
      expect(pits.length).toBe(12)
      expect(stores.length).toBe(2)
    })

    test('4-row pit board without stores produces ops + divider', () => {
      const engine = {
        topology: { type: 'pit', rows: 4, cols: 8, stores: false },
        surface: 'earth',
        render: { cellSize: 18, cornerRadius: 14 },
      }
      const result = produceLayout(engine)
      const pits = result.config.ops.filter(o => o.attrs && String(o.attrs['data-sq'] || '').startsWith('pit-'))
      const stores = result.config.ops.filter(o => o.attrs && String(o.attrs['data-sq'] || '').startsWith('store-'))
      const dividers = result.config.ops.filter(o => o.tag === 'line')
      expect(pits.length).toBe(32)
      expect(stores.length).toBe(0)
      expect(dividers.length).toBe(1)
    })

    test('ellipse pit board (congkak-style) produces ops', () => {
      const engine = {
        topology: { type: 'pit', cols: 7 },
        surface: 'earth',
        render: { cellSize: 18, boardShape: 'ellipse', storeSize: [20, 38], pitCurve: 4 },
      }
      const result = produceLayout(engine)
      const ellipses = result.config.ops.filter(o => o.tag === 'ellipse')
      const pits = result.config.ops.filter(o => o.attrs && String(o.attrs['data-sq'] || '').startsWith('pit-'))
      expect(ellipses.length).toBe(4) // 2 board + 2 stores
      expect(pits.length).toBe(14)
    })
  })

  describe('graph topology', () => {
    test('morris — concentric rings structure produces ops', () => {
      const engine = {
        topology: { type: 'graph', structure: 'concentric-rings', params: { rings: 3, midpoints: true } },
        surface: 'slate',
        render: { nodeRadius: 7 },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('graph')
      expect(result.config.ops).toBeDefined()
      expect(result.config.ops.length).toBeGreaterThan(0)
      expect(result.config.width).toBe(320)
      expect(result.config.height).toBe(320)
      expect(result.config.ops[0].op).toBe('rect')
    })

    test('nyout — perimeter-cross structure produces ops', () => {
      const engine = {
        topology: { type: 'graph', structure: 'perimeter-cross' },
        surface: {},
        render: {},
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('graph')
      expect(result.config.ops.length).toBe(3)
      expect(result.config.ops[1].op).toBe('edges')
      expect(result.config.ops[2].op).toBe('nodes')
    })
  })

  describe('edge cases', () => {
    test('returns null for no engine', () => {
      expect(produceLayout(null)).toBeNull()
      expect(produceLayout(undefined)).toBeNull()
    })

    test('returns null for no topology', () => {
      expect(produceLayout({ render: {} })).toBeNull()
    })

    test('returns null for unknown topology type', () => {
      expect(produceLayout({ topology: { type: 'unknown' } })).toBeNull()
    })

    test('handles missing surface gracefully', () => {
      const engine = {
        topology: { type: 'grid', rows: 8, cols: 8 },
        render: { cellSize: 40, cellColor: 'checkered' },
      }
      const result = produceLayout(engine)
      expect(result).not.toBeNull()
      expect(result.config.cellFill(0, 0)).toBe('#f0d9b5')
    })

    test('surface with overrides', () => {
      const engine = {
        topology: { type: 'grid', rows: 8, cols: 8 },
        surface: { base: 'wood-classic', colors: { 'cell-light': '#ffffff' } },
        render: { cellSize: 40, cellColor: 'checkered' },
      }
      const result = produceLayout(engine)
      expect(result.config.cellFill(0, 0)).toBe('#ffffff')
      expect(result.config.cellFill(0, 1)).toBe('#b58863')
    })

    test('xiangqi river texts emitted from decorations (ops path)', () => {
      const engine = {
        topology: { type: 'grid', rows: 10, cols: 9, layout: 'intersections' },
        surface: { colors: { stroke: '#4a3520' } },
        render: {
          cellSize: 36,
          ops: [
            { op: 'grid-lines', color: '#4a3520', width: 2, split: { topRow: 4, bottomRow: 5 } },
          ],
          decorations: [
            { type: 'gap', rows: [4, 5] },
            { type: 'texts', items: [
              { text: '楚 河', position: 'river-left' },
              { text: '漢 界', position: 'river-right' },
            ] },
          ],
        },
      }
      const result = produceLayout(engine)
      const textsOp = result.config.ops.find(o => o.op === 'texts')
      expect(textsOp).toBeDefined()
      expect(textsOp.items).toHaveLength(2)
      expect(textsOp.items[0].text).toBe('楚 河')
      expect(textsOp.items[1].text).toBe('漢 界')
      expect(textsOp.items[0].attrs['text-anchor']).toBe('middle')
      expect(textsOp.items[0].attrs['font-family']).toBe('serif')
      expect(textsOp.items[0].attrs.x).toBeLessThan(textsOp.items[1].attrs.x)
    })

    test('xiangqi river texts emitted from decorations (non-ops path)', () => {
      const engine = {
        topology: { type: 'grid', rows: 10, cols: 9, layout: 'intersections' },
        surface: { colors: { stroke: '#4a3520' } },
        render: {
          cellSize: 36,
          cellColor: 'uniform',
          decorations: [
            { type: 'gap', rows: [4, 5] },
            { type: 'texts', items: [
              { text: '楚 河', position: 'river-left' },
              { text: '漢 界', position: 'river-right' },
            ] },
          ],
        },
      }
      const result = produceLayout(engine)
      expect(result.config.texts).toHaveLength(2)
      expect(result.config.texts[0].text).toBe('楚 河')
      expect(result.config.texts[1].text).toBe('漢 界')
      expect(result.config.texts[0].attrs.x).toBeLessThan(result.config.texts[1].attrs.x)
    })
  })
})
