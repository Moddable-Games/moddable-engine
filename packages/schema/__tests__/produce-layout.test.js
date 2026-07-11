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
    test('standard hex — rhombus 11x11', () => {
      const engine = {
        topology: { type: 'hex', shape: 'rhombus', rows: 11, cols: 11, orientation: 'pointy' },
        surface: 'slate',
        render: { cellSize: 20, cellColor: 'uniform', frame: 'rhombus' },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('hex')
      expect(result.shape).toBe('rhombus')
      expect(result.params).toEqual({ rows: 11, cols: 11 })
      expect(result.config.cellSize).toBe(20)
      expect(result.config.orientation).toBe('pointy')
      expect(result.config.frame).not.toBeNull()
      expect(result.config.background).toBeNull()
    })

    test('hexagonal shape with tricolor', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5, orientation: 'flat' },
        surface: 'wood-classic',
        render: { cellSize: 22, cellColor: 'tricolor' },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('hex')
      expect(result.shape).toBe('hexagonal')
      expect(result.params).toEqual({ radius: 5 })
      expect(result.config.cellFill).toBeInstanceOf(Function)
      // tricolor: (q-r) % 3 determines colour
      expect(result.config.cellFill(0, 0)).toBe('#f0d9b5') // light
      expect(result.config.cellFill(1, 0)).toBe('#d4a76a') // mid
      expect(result.config.cellFill(2, 0)).toBe('#b58863') // dark
    })

    test('bicolor (ring-based)', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5 },
        surface: 'slate',
        render: { cellSize: 22, cellColor: 'bicolor' },
      }
      const result = produceLayout(engine)
      const fn = result.config.cellFill
      expect(fn(0, 0)).toBe('#c0c0c0') // ring 0 → dark
      expect(fn(1, 0)).toBe('#e8e8e8') // ring 1 → light
      expect(fn(2, 0)).toBe('#c0c0c0') // ring 2 → dark
    })

    test('no frame = background rect', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5 },
        surface: 'wood-classic',
        render: { cellSize: 22 },
      }
      const result = produceLayout(engine)
      expect(result.config.frame).toBeNull()
      expect(result.config.background).not.toBeNull()
      expect(result.config.background.fill).toBe('#2c2c2c')
    })

    test('centre marker', () => {
      const engine = {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5 },
        surface: 'slate',
        render: { cellSize: 22, centreMarker: '★' },
      }
      const result = produceLayout(engine)
      expect(result.config.centreMarker).not.toBeNull()
      expect(result.config.centreMarker.text).toBe('★')
      expect(result.config.centreMarker.q).toBe(0)
      expect(result.config.centreMarker.r).toBe(0)
    })

    test('triangular shape', () => {
      const engine = {
        topology: { type: 'hex', shape: 'triangular', sideLength: 12 },
        surface: 'slate',
        render: { cellSize: 18 },
      }
      const result = produceLayout(engine)
      expect(result.shape).toBe('triangular')
      expect(result.params).toEqual({ sideLength: 12 })
    })
  })

  describe('track topology', () => {
    test('backgammon — triangular points', () => {
      const engine = {
        topology: { type: 'track', positions: 24 },
        surface: 'parchment',
        render: { trackStyle: 'triangular-points' },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('track')
      expect(result.config.style).toBe('points')
      expect(result.config.frameW).toBe(16)
      expect(result.config.barW).toBe(24)
      expect(result.config.pointW).toBe(32)
      expect(result.config.boardH).toBe(320)
    })

    test('perimeter — landlords style', () => {
      const engine = {
        topology: { type: 'track', positions: 40 },
        surface: 'parchment',
        render: { trackStyle: 'perimeter' },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('track')
      expect(result.config.style).toBe('perimeter')
      expect(result.config.totalSpaces).toBe(40)
      expect(result.config.corners).toBe(4)
    })
  })

  describe('pit topology', () => {
    test('mancala — standard 2-row 6-pit', () => {
      const engine = {
        topology: { type: 'pit', rows: 2, cols: 6, stores: true },
        surface: 'earth',
        render: {},
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('pit')
      expect(result.cols).toBe(6)
      expect(result.stores).toBe(true)
      expect(result.config.pitRadius).toBe(22)
      expect(result.config.colors.boardOuter).toBe('#7A5A32')
      expect(result.config.colors.seed).toBe('#C8B898')
      expect(result.config.boardRows).toBe(2)
    })

    test('4-row pit board', () => {
      const engine = {
        topology: { type: 'pit', rows: 4, cols: 8, stores: false },
        surface: 'earth',
        render: { pitRadius: 18, cornerRadius: 14 },
      }
      const result = produceLayout(engine)
      expect(result.cols).toBe(8)
      expect(result.stores).toBe(false)
      expect(result.config.boardRows).toBe(4)
      expect(result.config.pitRadius).toBe(18)
      expect(result.config.cornerRadius).toBe(14)
    })
  })

  describe('graph topology', () => {
    test('morris — concentric rings structure', () => {
      const engine = {
        topology: { type: 'graph', structure: 'concentric-rings', params: { rings: 3, midpoints: true } },
        surface: 'slate',
        render: { nodeRadius: 7 },
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('graph')
      expect(result.config.structure).toBe('concentric-rings')
      expect(result.config.params).toEqual({ rings: 3, midpoints: true })
      expect(result.config.nodeRadius).toBe(7)
      expect(result.config.edgeStyle.stroke).toBe('rgba(0,0,0,0.3)')
    })

    test('explicit nodes/edges', () => {
      const engine = {
        topology: {
          type: 'graph',
          nodes: [{ id: 'a', x: 10, y: 10 }, { id: 'b', x: 100, y: 100 }],
          edges: [{ from: 'a', to: 'b' }],
        },
        surface: 'slate',
        render: {},
      }
      const result = produceLayout(engine)
      expect(result.type).toBe('graph')
      expect(result.config.nodes).toHaveLength(2)
      expect(result.config.edges).toHaveLength(1)
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
  })
})
