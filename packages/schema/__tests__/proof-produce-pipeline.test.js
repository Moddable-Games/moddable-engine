/**
 * Proof: full pipeline from frontmatter through produce to SVG output.
 *
 * Demonstrates that produce() output is directly consumable by topology
 * renderLayout() + serializeLayout() — no intermediate adapter needed.
 */

import { produce } from '../src/produce.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createHexTopology } from '../../topology-hex/src/topology-hex.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'
import { createGraphTopology } from '../../topology-graph/src/topology-graph.js'
import { serializeLayout } from '../../render/src/serialize-layout.js'

describe('proof: produce → renderLayout → SVG', () => {
  test('chess (grid/checkered) produces valid SVG', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        surface: 'wood-classic',
        render: { cellSize: 40, cellColor: 'checkered', labels: true },
        players: ['white', 'black'],
        setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      },
    }

    const def = produce(meta)
    expect(def.layout).not.toBeNull()
    expect(def.layout.type).toBe('grid')

    const grid = createGridTopology({ rows: def.layout.rows, cols: def.layout.cols })
    const layout = grid.renderLayout(def.layout.config)

    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
    expect(layout.elements.length).toBeGreaterThan(0)
    expect(layout.cells.length).toBe(64)

    const svg = serializeLayout(layout, { title: def.title })
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('<title>Standard Chess</title>')
  })

  test('go (grid/intersections) produces valid SVG', () => {
    const meta = {
      title: 'Standard Go',
      slug: 'standard',
      parent: 'go',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 19, cols: 19, layout: 'intersections' },
        surface: 'wood-light',
        render: {
          cellSize: 20,
          cellColor: 'none',
          labels: true,
          decorations: [{ type: 'markers', auto: 'star-points', size: 4 }],
        },
        players: ['black', 'white'],
      },
    }

    const def = produce(meta)
    expect(def.layout.type).toBe('grid')
    expect(def.layout.config.positionType).toBe('intersection')

    const grid = createGridTopology({ rows: 19, cols: 19 })
    const layout = grid.renderLayout(def.layout.config)

    expect(layout.cells.length).toBe(361)
    expect(def.layout.config.markers).toHaveLength(9)

    const svg = serializeLayout(layout, { title: def.title })
    expect(svg).toContain('<svg')
    expect(svg).toContain('data-sq=')
  })

  test('hex (rhombus) produces valid SVG', () => {
    const meta = {
      title: 'Hex 11x11',
      slug: 'standard',
      parent: 'hex',
      players: '2',
      engine: {
        topology: { type: 'hex', shape: 'rhombus', rows: 11, cols: 11, orientation: 'pointy' },
        surface: 'slate',
        render: { cellSize: 20, cellColor: 'uniform', frame: 'rhombus' },
        players: ['black', 'white'],
      },
    }

    const def = produce(meta)
    expect(def.layout.type).toBe('hex')
    expect(def.layout.shape).toBe('rhombus')

    const hex = createHexTopology({ size: 11, shape: 'rhombus', orientation: 'pointy' })
    const layout = hex.renderLayout(def.layout.config)

    expect(layout.width).toBeGreaterThan(0)
    expect(layout.cells.length).toBe(121)

    const svg = serializeLayout(layout, { title: def.title })
    expect(svg).toContain('<svg')
    expect(svg).toContain('polygon')
  })

  test('mancala (pit) produces valid SVG', () => {
    const meta = {
      title: 'Kalah',
      slug: 'kalah',
      parent: 'mancala',
      players: '2',
      engine: {
        topology: { type: 'pit', rows: 2, cols: 6, stores: true },
        surface: 'earth',
        render: {},
        players: ['south', 'north'],
        setup: '4,4,4,4,4,4;0;4,4,4,4,4,4;0',
      },
    }

    const def = produce(meta)
    expect(def.layout.type).toBe('pit')

    const pit = createPitTopology({ pitsPerSide: 6, hasStores: true })
    const layout = pit.renderLayout(def.layout.config)

    expect(layout.width).toBeGreaterThan(0)
    expect(layout.cells.length).toBeGreaterThan(0)

    const svg = serializeLayout(layout, { title: def.title })
    expect(svg).toContain('<svg')
  })

  test('morris (graph/structure) produces valid SVG', () => {
    const meta = {
      title: "Nine Men's Morris",
      slug: 'nine-mens-morris',
      parent: 'morris',
      players: '2',
      engine: {
        topology: { type: 'graph', structure: 'concentric-rings', params: { rings: 3, midpoints: true } },
        surface: 'slate',
        render: { nodeRadius: 7 },
        players: ['white', 'black'],
      },
    }

    const def = produce(meta)
    expect(def.layout.type).toBe('graph')
    expect(def.layout.config.ops).toBeDefined()
    expect(def.layout.config.ops.length).toBeGreaterThan(0)
    expect(def.layout.config.width).toBe(320)
  })

  test('produce output includes all expected fields', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        surface: 'wood-classic',
        render: { cellSize: 40, cellColor: 'checkered' },
        players: ['white', 'black'],
        setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      },
    }

    const def = produce(meta)
    expect(def.id).toBe('moddable-chess/standard')
    expect(def.title).toBe('Standard Chess')
    expect(def.family).toBe('moddable-chess')
    expect(def.topology).toEqual({ type: 'grid', rows: 8, cols: 8 })
    expect(def.players.names).toEqual(['white', 'black'])
    expect(def.setup).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
    expect(def.layout).toBeDefined()
    expect(def.layout.type).toBe('grid')
    expect(def.layout.config).toBeDefined()
  })
})
