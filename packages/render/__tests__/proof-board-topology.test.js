import { createBoardRenderer } from '../src/board-renderer.js'
import { createBoard, builtinBoards } from '../../board-layout/index.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createTrackTopology } from '../../topology-track/src/topology-track.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'

describe('proof: board + topology composition matches rulebook patterns', () => {
  const renderer = createBoardRenderer({ padding: 24 })

  test('Go 19x19: slab board + intersection topology + star points', () => {
    const board = createBoard(builtinBoards.slab({
      width: 438,
      height: 438,
      borderWidth: 24,
      surfaceInset: 15,
      slabColor: '#dcb35c',
      surfaceColor: '#d4a843',
    }))

    const go = createGridTopology({ rows: 19, cols: 19 })
    const stars = [
      [3, 3], [3, 9], [3, 15],
      [9, 3], [9, 9], [9, 15],
      [15, 3], [15, 9], [15, 15],
    ]
    const layout = go.getLayout({ mode: 'intersections', spacing: 20, starPoints: stars })

    const svg = renderer.render(layout, { board })

    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#dcb35c"')
    expect(svg).toContain('fill="#d4a843"')
    expect(svg).toContain('<line')
    expect(svg).toContain('stroke="#3d2b1a"')
    const starCircles = (svg.match(/r="3"/g) || []).length
    expect(starCircles).toBe(9)
    expect(svg).toContain('>A<')
    expect(svg).toContain('>J<')
    expect(svg).not.toContain('>I<')
  })

  test('Xiangqi: river board + intersection topology + palace diagonals', () => {
    const board = createBoard(builtinBoards.river({
      width: 360,
      height: 430,
      surfaceColor: '#f5e6c8',
      riverY: 190,
      riverHeight: 30,
    }))

    const xiangqi = createGridTopology({ rows: 10, cols: 9 })
    const layout = xiangqi.getLayout({
      mode: 'intersections',
      spacing: 40,
      riverAfterRow: 4,
      riverHeight: 30,
      palaces: [
        { row: 0, col: 3, width: 2, height: 2 },
        { row: 7, col: 3, width: 2, height: 2 },
      ],
    })

    const svg = renderer.render(layout, { board })

    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#f5e6c8"')
    const lines = (svg.match(/<line/g) || []).length
    expect(lines).toBe(32)
  })

  test('Backgammon: split board + points topology', () => {
    const board = createBoard(builtinBoards.split({
      width: 440,
      height: 320,
      frameWidth: 16,
      barWidth: 24,
      frameColor: '#3d2b1f',
      surfaceColor: '#1a5c3a',
    }))

    const track = createTrackTopology({
      positions: Array.from({ length: 24 }, (_, i) => `point-${i + 1}`),
      circuit: false,
    })
    const layout = track.getLayout({
      style: 'points',
      pointsPerSide: 12,
      pointWidth: 32,
      pointHeight: 120,
      boardHeight: 288,
      halves: true,
      gapBetweenHalves: 24,
    })

    const svg = renderer.render(layout, { board })

    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#3d2b1f"')
    expect(svg).toContain('fill="#1a5c3a"')
    expect(svg).toContain('<polygon')
    const polygons = (svg.match(/<polygon/g) || []).length
    expect(polygons).toBe(24)
  })

  test('Mancala: capsule board + pit topology', () => {
    const board = createBoard(builtinBoards.capsule({
      width: 520,
      height: 180,
      frameWidth: 6,
      outerRadius: 22,
      innerRadius: 18,
      frameColor: '#7A5A32',
      surfaceColor: '#9B7740',
    }))

    const pit = createPitTopology({ pitsPerSide: 6, players: 2, hasStores: true })
    const layout = pit.getLayout()

    const svg = renderer.render(layout, { board })

    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#7A5A32"')
    expect(svg).toContain('fill="#9B7740"')
    expect(svg).toContain('<ellipse')
  })

  test('Chess: rectangle board + alternating tile topology', () => {
    const board = createBoard(builtinBoards.rectangle({
      width: 368,
      height: 368,
      frameWidth: 24,
      frameColor: '#5c3a1e',
      surfaceColor: '#f5e6c8',
    }))

    const chess = createGridTopology({ rows: 8, cols: 8 })
    const layout = chess.getLayout({ tileSize: 40, alternating: true })

    const svg = renderer.render(layout, { board })

    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#5c3a1e"')
    const rects = (svg.match(/<rect/g) || []).length
    expect(rects).toBeGreaterThanOrEqual(64 + 2)
  })

  test('Card table: felt board with no topology', () => {
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

    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#1a5c3a"')
    expect(svg).toContain('stroke="#0d3d1f"')
    expect(svg).not.toContain('<polygon')
  })

  test('board with generators produces dynamic elements', () => {
    const terrainGen = (state) => {
      return [
        { layer: 'decoration', element: 'rect', attrs: { x: 10, y: 10, width: 30, height: 30, fill: '#ff0000' } },
        { layer: 'decoration', element: 'circle', attrs: { cx: 50, cy: 50, r: 10, fill: '#00ff00' } },
      ]
    }

    const board = createBoard({
      width: 200,
      height: 200,
      surfaces: [{ element: 'rect', attrs: { x: 0, y: 0, width: 200, height: 200, fill: '#333' } }],
      generators: [terrainGen],
    })

    const els = board.getElements()
    expect(els).toHaveLength(3)
    expect(els[1].attrs.fill).toBe('#ff0000')
    expect(els[2].attrs.fill).toBe('#00ff00')
  })

  test('board with SVG filters', () => {
    const board = createBoard({
      width: 300,
      height: 300,
      surfaces: [{ element: 'rect', attrs: { x: 0, y: 0, width: 300, height: 300, fill: '#666' } }],
      filters: ['<filter id="shadow"><feDropShadow dx="2" dy="2" stdDeviation="3"/></filter>'],
    })

    const layout = createGridTopology({ rows: 3, cols: 3 }).getLayout({ tileSize: 40 })
    const svg = renderer.render(layout, { board })

    expect(svg).toContain('<defs>')
    expect(svg).toContain('feDropShadow')
    expect(svg).toContain('</defs>')
  })
})
