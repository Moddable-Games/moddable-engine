import { createThemeResolver, builtinThemes } from '../index.js'

describe('board-theme resolver', () => {
  describe('builtinThemes', () => {
    it('exports classic, minimal, and wood themes', () => {
      expect(builtinThemes.classic).toBeDefined()
      expect(builtinThemes.minimal).toBeDefined()
      expect(builtinThemes.wood).toBeDefined()
    })

    it('each theme has required shape', () => {
      for (const [id, theme] of Object.entries(builtinThemes)) {
        expect(theme.id).toBe(id)
        expect(theme.name).toEqual(expect.any(String))
        expect(theme.cells).toEqual(expect.any(Object))
        expect(theme.cells.default || theme.cells.uniform).toBeDefined()
        expect(theme.lines).toEqual(expect.any(Object))
        expect(theme.annotations).toEqual(expect.any(Object))
        expect(theme.background).toEqual(expect.any(Object))
        expect(theme.labels).toEqual(expect.any(Object))
      }
    })

    it('classic theme has grid cell types', () => {
      expect(builtinThemes.classic.cells.light).toEqual({ fill: '#f0d9b5' })
      expect(builtinThemes.classic.cells.dark).toEqual({ fill: '#b58863' })
    })

    it('classic theme has topology-specific cell types', () => {
      expect(builtinThemes.classic.cells.node).toBeDefined()
      expect(builtinThemes.classic.cells.pit).toBeDefined()
      expect(builtinThemes.classic.cells.store).toBeDefined()
    })
  })

  describe('createThemeResolver()', () => {
    let resolver

    beforeEach(() => {
      resolver = createThemeResolver()
    })

    it('resolves builtin themes by id', () => {
      const theme = resolver.resolve('classic')
      expect(theme.id).toBe('classic')
      expect(theme.cells.light).toEqual({ fill: '#f0d9b5' })
    })

    it('falls back to classic for unknown theme id', () => {
      const theme = resolver.resolve('nonexistent')
      expect(theme.id).toBe('classic')
    })

    it('lists all available themes', () => {
      const list = resolver.list()
      expect(list).toContain('classic')
      expect(list).toContain('minimal')
      expect(list).toContain('wood')
    })

    it('get() returns null for unknown theme', () => {
      expect(resolver.get('nonexistent')).toBeNull()
    })

    it('get() returns theme object for known theme', () => {
      const theme = resolver.get('wood')
      expect(theme.id).toBe('wood')
      expect(theme.name).toBe('Wooden Board')
    })

    it('register() adds a custom theme', () => {
      resolver.register('neon', {
        name: 'Neon',
        cells: { default: { fill: '#0ff' } },
        lines: { stroke: '#f0f' },
        annotations: { default: { fill: '#fff' } },
        background: { fill: '#000' },
        labels: { fill: '#0f0' },
      })
      const theme = resolver.resolve('neon')
      expect(theme.id).toBe('neon')
      expect(theme.cells.default.fill).toBe('#0ff')
    })
  })

  describe('createThemeResolver(customThemes)', () => {
    it('accepts custom themes at creation', () => {
      const resolver = createThemeResolver({
        custom: {
          id: 'custom',
          name: 'Custom',
          cells: { default: { fill: '#abc' } },
          lines: { stroke: '#000' },
          annotations: { default: { fill: '#000' } },
          background: { fill: '#fff' },
          labels: { fill: '#000' },
        },
      })
      expect(resolver.list()).toContain('custom')
      expect(resolver.resolve('custom').cells.default.fill).toBe('#abc')
    })

    it('custom themes override builtins with same id', () => {
      const resolver = createThemeResolver({
        classic: {
          id: 'classic',
          name: 'My Classic',
          cells: { default: { fill: '#000' } },
          lines: { stroke: '#000' },
          annotations: { default: { fill: '#000' } },
          background: { fill: '#000' },
          labels: { fill: '#000' },
        },
      })
      expect(resolver.resolve('classic').name).toBe('My Classic')
    })
  })

  describe('integration with renderer theme contract', () => {
    it('resolved theme has the shape the renderer expects', () => {
      const resolver = createThemeResolver()
      const theme = resolver.resolve('classic')

      expect(theme.cells).toEqual(expect.any(Object))
      expect(theme.lines).toEqual(expect.any(Object))
      expect(theme.background).toEqual(expect.any(Object))

      const cellStyle = theme.cells.light
      expect(cellStyle.fill).toEqual(expect.any(String))
    })
  })
})
