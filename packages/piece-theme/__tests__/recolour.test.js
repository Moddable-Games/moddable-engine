import { recolour, createRecolourFilter, applyFilters } from '../src/recolour.js'

describe('piece-theme recolour', () => {
  const baseSvg = '<svg><circle fill="#ffffff" stroke="#333333"/><path fill="#ffffff"/></svg>'

  describe('recolour()', () => {
    it('replaces all occurrences of a colour in SVG string', () => {
      const result = recolour(baseSvg, { '#ffffff': '#000000' })
      expect(result).toBe('<svg><circle fill="#000000" stroke="#333333"/><path fill="#000000"/></svg>')
    })

    it('handles multiple colour mappings', () => {
      const result = recolour(baseSvg, {
        '#ffffff': '#1a1a1a',
        '#333333': '#cccccc',
      })
      expect(result).toBe('<svg><circle fill="#1a1a1a" stroke="#cccccc"/><path fill="#1a1a1a"/></svg>')
    })

    it('is case-insensitive', () => {
      const svg = '<svg><rect fill="#FFFFFF"/></svg>'
      const result = recolour(svg, { '#ffffff': '#000' })
      expect(result).toBe('<svg><rect fill="#000"/></svg>')
    })

    it('returns unchanged string when no matches', () => {
      const result = recolour(baseSvg, { '#abcdef': '#123456' })
      expect(result).toBe(baseSvg)
    })

    it('handles empty colour map', () => {
      const result = recolour(baseSvg, {})
      expect(result).toBe(baseSvg)
    })
  })

  describe('createRecolourFilter()', () => {
    it('creates a filter descriptor', () => {
      const filter = createRecolourFilter('#fff', '#000')
      expect(filter).toEqual({ type: 'recolour', base: '#fff', target: '#000' })
    })
  })

  describe('applyFilters()', () => {
    it('applies a sequence of recolour filters', () => {
      const filters = [
        createRecolourFilter('#ffffff', '#1a1a1a'),
        createRecolourFilter('#333333', '#aaaaaa'),
      ]
      const result = applyFilters(baseSvg, filters)
      expect(result).toContain('#1a1a1a')
      expect(result).toContain('#aaaaaa')
      expect(result).not.toContain('#ffffff')
      expect(result).not.toContain('#333333')
    })

    it('handles empty filter list', () => {
      expect(applyFilters(baseSvg, [])).toBe(baseSvg)
    })
  })
})
