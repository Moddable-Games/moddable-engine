import { createBoard, builtinBoards, createBoardRegistry } from '../index.js'

describe('surface', () => {
  describe('createBoard', () => {
    it('returns dimensions from definition', () => {
      const board = createBoard({ width: 400, height: 300 })
      expect(board.getDimensions()).toEqual({ width: 400, height: 300 })
    })

    it('returns surface bounds inset by frame', () => {
      const board = createBoard({
        width: 440,
        height: 320,
        frame: { element: 'rect', attrs: { x: 0, y: 0, width: 440, height: 320, fill: '#333' }, inset: 16 },
      })
      expect(board.getSurfaceBounds()).toEqual({ x: 16, y: 16, width: 408, height: 288 })
    })

    it('returns full bounds when no frame', () => {
      const board = createBoard({ width: 300, height: 300 })
      expect(board.getSurfaceBounds()).toEqual({ x: 0, y: 0, width: 300, height: 300 })
    })

    it('returns elements in layer order: frame, surface, divider, decoration', () => {
      const board = createBoard({
        width: 200,
        height: 200,
        frame: { element: 'rect', attrs: { fill: '#000' }, inset: 10 },
        surfaces: [{ element: 'rect', attrs: { fill: '#fff' } }],
        dividers: [{ element: 'line', attrs: { x1: 100, y1: 0, x2: 100, y2: 200 } }],
        decorations: [{ element: 'circle', attrs: { cx: 50, cy: 50, r: 5 } }],
      })
      const els = board.getElements()
      expect(els).toHaveLength(4)
      expect(els[0].layer).toBe('frame')
      expect(els[1].layer).toBe('surface')
      expect(els[2].layer).toBe('divider')
      expect(els[3].layer).toBe('decoration')
    })

    it('omits frame element when no frame defined', () => {
      const board = createBoard({
        width: 200,
        height: 200,
        surfaces: [{ element: 'rect', attrs: { fill: '#fff' } }],
      })
      const els = board.getElements()
      expect(els.every(e => e.layer !== 'frame')).toBe(true)
    })
  })

  describe('builtinBoards', () => {
    it('rectangle produces framed board', () => {
      const def = builtinBoards.rectangle({ width: 368, height: 368, frameWidth: 24, frameColor: '#5c3a1e', surfaceColor: '#f5e6c8' })
      expect(def.width).toBe(368)
      expect(def.frame.element).toBe('rect')
      expect(def.frame.inset).toBe(24)
      expect(def.surfaces).toHaveLength(1)
    })

    it('split produces two surfaces with bar divider', () => {
      const def = builtinBoards.split({ width: 440, height: 320, frameWidth: 16, barWidth: 24, surfaceColor: '#1a5c3a' })
      expect(def.surfaces).toHaveLength(2)
      expect(def.dividers).toHaveLength(1)
      expect(def.dividers[0].element).toBe('rect')
    })

    it('capsule produces rounded frame for mancala-style boards', () => {
      const def = builtinBoards.capsule({ width: 520, height: 180, outerRadius: 22, frameColor: '#7A5A32', surfaceColor: '#9B7740' })
      expect(def.frame.attrs.rx).toBe(22)
      expect(def.surfaces[0].attrs.rx).toBe(18)
    })

    it('slab produces simple surface with optional inset', () => {
      const def = builtinBoards.slab({ width: 438, height: 438, borderWidth: 24, surfaceInset: 15, slabColor: '#dcb35c', surfaceColor: '#d4a843' })
      expect(def.surfaces).toHaveLength(2)
      expect(def.frame).toBe(null)
    })

    it('felt produces circular or rectangular surface', () => {
      const circular = builtinBoards.felt({ width: 400, height: 400, radius: 180, feltColor: '#1a5c3a' })
      expect(circular.surfaces[0].element).toBe('circle')

      const rect = builtinBoards.felt({ width: 600, height: 400, feltColor: '#1a5c3a' })
      expect(rect.surfaces[0].element).toBe('rect')
    })

    it('river produces surface with horizontal divider', () => {
      const def = builtinBoards.river({ width: 400, height: 440, riverY: 200, riverHeight: 20, surfaceColor: '#f5e6c8' })
      expect(def.dividers).toHaveLength(1)
      expect(def.dividers[0].attrs.y).toBe(200)
    })
  })

  describe('createBoardRegistry', () => {
    it('creates boards from built-in types', () => {
      const registry = createBoardRegistry()
      const board = registry.create('rectangle', { width: 300, height: 300 })
      expect(board.getDimensions()).toEqual({ width: 300, height: 300 })
    })

    it('lists available board types', () => {
      const registry = createBoardRegistry()
      const types = registry.list()
      expect(types).toContain('rectangle')
      expect(types).toContain('split')
      expect(types).toContain('capsule')
      expect(types).toContain('slab')
      expect(types).toContain('felt')
      expect(types).toContain('river')
    })

    it('throws on unknown board type', () => {
      const registry = createBoardRegistry()
      expect(() => registry.create('nonexistent')).toThrow('Unknown board type')
    })

    it('supports custom board registration', () => {
      const registry = createBoardRegistry()
      registry.register('custom', (params) => ({
        width: params.size,
        height: params.size,
        surfaces: [{ element: 'circle', attrs: { cx: params.size / 2, cy: params.size / 2, r: params.size / 2, fill: '#000' } }],
      }))
      const board = registry.create('custom', { size: 200 })
      expect(board.getDimensions()).toEqual({ width: 200, height: 200 })
    })
  })
})
