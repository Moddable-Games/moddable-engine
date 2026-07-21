import { createTableauTopology, schema } from '../tableau/index.js'

describe('topology-tableau schema', () => {
  test('type is tableau', () => {
    expect(schema.type).toBe('tableau')
  })

  test('required includes layout', () => {
    expect(schema.required).toContain('layout')
  })

  test('matchBoard matches tableau-related terms', () => {
    expect(schema.matchBoard('tableau with 7 columns')).toBe(true)
    expect(schema.matchBoard('radial table layout')).toBe(true)
    expect(schema.matchBoard('mahjong wall')).toBe(true)
    expect(schema.matchBoard('player hand zones')).toBe(true)
    expect(schema.matchBoard('8x8 grid')).toBe(false)
  })

  test('parseBoard extracts layout type', () => {
    expect(schema.parseBoard('tableau columns')).toEqual({ type: 'tableau', layout: 'tableau' })
    expect(schema.parseBoard('mahjong wall')).toEqual({ type: 'tableau', layout: 'wall' })
    expect(schema.parseBoard('radial table')).toEqual({ type: 'tableau', layout: 'radial' })
    expect(schema.parseBoard('8x8')).toBeNull()
  })
})

describe('topology-tableau radial', () => {
  const topo = createTableauTopology({ layout: 'radial', players: 4 })

  test('has correct cell count', () => {
    expect(topo.getCellCount()).toBe(7)
  })

  test('getAllCells returns hand + community + draw + discard', () => {
    const cells = topo.getAllCells()
    expect(cells).toContain('hand-0')
    expect(cells).toContain('hand-1')
    expect(cells).toContain('hand-2')
    expect(cells).toContain('hand-3')
    expect(cells).toContain('community')
    expect(cells).toContain('draw')
    expect(cells).toContain('discard')
  })

  test('getCell returns cell by key', () => {
    const cell = topo.getCell('hand-0')
    expect(cell).not.toBeNull()
    expect(cell.cellType).toBe('hand')
    expect(cell.player).toBe(0)
  })

  test('getCellsByType filters correctly', () => {
    const hands = topo.getCellsByType('hand')
    expect(hands).toHaveLength(4)
    const draws = topo.getCellsByType('draw')
    expect(draws).toHaveLength(1)
  })

  test('isValid checks cell existence', () => {
    expect(topo.isValid('hand-0')).toBe(true)
    expect(topo.isValid('hand-5')).toBe(false)
    expect(topo.isValid('community')).toBe(true)
  })

  test('toJSON and fromJSON are identity for keys', () => {
    expect(topo.toJSON('hand-2')).toBe('hand-2')
    expect(topo.fromJSON('draw')).toBe('draw')
  })

  test('getLayout returns radial positions', () => {
    const layout = topo.getLayout()
    const cells = layout.getCells()
    expect(cells.length).toBe(7)
    const dims = layout.getDimensions()
    expect(dims.width).toBe(800)
    expect(dims.height).toBe(600)
    expect(layout.getLines()).toEqual([])
  })

  test('getLayout has defaults for cell types', () => {
    const layout = topo.getLayout()
    expect(layout.defaults.cells.hand).toBeDefined()
    expect(layout.defaults.cells.draw).toBeDefined()
  })

  test('2-player radial has 5 cells', () => {
    const topo2 = createTableauTopology({ layout: 'radial', players: 2 })
    expect(topo2.getCellCount()).toBe(5)
    expect(topo2.getAllCells()).toContain('hand-0')
    expect(topo2.getAllCells()).toContain('hand-1')
  })

  test('6-player radial has 9 cells', () => {
    const topo6 = createTableauTopology({ layout: 'radial', players: 6 })
    expect(topo6.getCellCount()).toBe(9)
  })
})

describe('topology-tableau tableau layout', () => {
  const topo = createTableauTopology({
    layout: 'tableau',
    columns: 7,
    cascade: [1, 2, 3, 4, 5, 6, 7],
    foundations: 4,
  })

  test('has correct cell count (28 column slots + 4 foundations + draw + waste)', () => {
    expect(topo.getCellCount()).toBe(34)
  })

  test('getAllCells includes column, foundation, draw, waste', () => {
    const cells = topo.getAllCells()
    expect(cells).toContain('col-0-0')
    expect(cells).toContain('col-6-6')
    expect(cells).toContain('foundation-0')
    expect(cells).toContain('foundation-3')
    expect(cells).toContain('draw')
    expect(cells).toContain('waste')
  })

  test('getCellsByType column returns 28 cells', () => {
    expect(topo.getCellsByType('column')).toHaveLength(28)
  })

  test('getCellsByType foundation returns 4 cells', () => {
    expect(topo.getCellsByType('foundation')).toHaveLength(4)
  })

  test('getLayout returns positioned cells', () => {
    const layout = topo.getLayout()
    const cells = layout.getCells()
    expect(cells.length).toBe(34)
    const col00 = cells.find(c => c.key === 'col-0-0')
    expect(col00.center.x).toBeGreaterThan(0)
    expect(col00.center.y).toBeGreaterThan(0)
  })

  test('freecell config (8 columns, all face up)', () => {
    const fc = createTableauTopology({
      layout: 'tableau',
      columns: 8,
      cascade: [7, 7, 7, 7, 6, 6, 6, 6],
      foundations: 4,
    })
    expect(fc.getCellsByType('column')).toHaveLength(52)
  })
})

describe('topology-tableau wall layout', () => {
  const topo = createTableauTopology({
    layout: 'wall',
    players: 4,
    wallSegments: 4,
  })

  test('has correct cell count (4 hands + 4 wall segments)', () => {
    expect(topo.getCellCount()).toBe(8)
  })

  test('getAllCells includes hands and walls', () => {
    const cells = topo.getAllCells()
    expect(cells).toContain('hand-0')
    expect(cells).toContain('hand-3')
    expect(cells).toContain('wall-0')
    expect(cells).toContain('wall-3')
  })

  test('getCellsByType wall returns 4', () => {
    expect(topo.getCellsByType('wall')).toHaveLength(4)
  })

  test('getLayout returns square dimensions', () => {
    const layout = topo.getLayout()
    const dims = layout.getDimensions()
    expect(dims.width).toBe(dims.height)
  })
})

describe('topology-tableau linear layout', () => {
  const topo = createTableauTopology({ layout: 'linear', players: 2 })

  test('has correct cell count (2 hands + draw)', () => {
    expect(topo.getCellCount()).toBe(3)
  })

  test('getLayout returns positioned cells', () => {
    const layout = topo.getLayout()
    const cells = layout.getCells()
    expect(cells).toHaveLength(3)
    const dims = layout.getDimensions()
    expect(dims.width).toBe(600)
    expect(dims.height).toBe(200)
  })
})

describe('topology-tableau serialization', () => {
  const topo = createTableauTopology({ layout: 'radial', players: 2 })

  test('serializePosition produces key:value pairs', () => {
    const notation = topo.serializePosition({ 'hand-0': 5, 'hand-1': 3, 'draw': 42 })
    expect(notation).toContain('hand-0:5')
    expect(notation).toContain('hand-1:3')
    expect(notation).toContain('draw:42')
  })

  test('parsePosition round-trips', () => {
    const state = { 'hand-0': 5, 'hand-1': 3, 'draw': 42 }
    const notation = topo.serializePosition(state)
    const parsed = topo.parsePosition(notation)
    expect(parsed['hand-0']).toBe(5)
    expect(parsed['hand-1']).toBe(3)
    expect(parsed['draw']).toBe(42)
  })

  test('parsePosition handles empty', () => {
    expect(topo.parsePosition('')).toEqual({})
    expect(topo.parsePosition('empty')).toEqual({})
  })
})

describe('topology-tableau via registry', () => {
  let registry

  beforeAll(async () => {
    registry = await import('../index.js')
  })

  test('tableau is registered', () => {
    expect(registry.has('tableau')).toBe(true)
  })

  test('create produces a topology instance', () => {
    const topo = registry.create({ type: 'tableau', layout: 'radial', players: 4 })
    expect(topo.getCellCount()).toBe(7)
    expect(topo.layout).toBe('radial')
  })

  test('getTypes includes tableau', () => {
    expect(registry.getTypes()).toContain('tableau')
  })
})
