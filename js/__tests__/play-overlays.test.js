// Minimal DOM mock for SVG element creation
const elements = []
function mockElement(tag) {
  const attrs = {}
  const children = []
  const el = {
    tagName: tag,
    setAttribute(k, v) { attrs[k] = String(v) },
    getAttribute(k) { return attrs[k] ?? null },
    appendChild(child) { children.push(child) },
    get childNodes() { return children },
    get firstChild() { return children[0] || null },
  }
  elements.push(el)
  return el
}

global.document = {
  createElementNS(ns, tag) { return mockElement(tag) },
}

import { paintHighlight, paintIndicator, paintFog, createOverlay } from '../play-overlays.js'

beforeEach(() => { elements.length = 0 })

describe('play-overlays', () => {
  describe('createOverlay', () => {
    it('creates a g element with pointer-events none', () => {
      const g = createOverlay()
      expect(g.tagName).toBe('g')
      expect(g.getAttribute('pointer-events')).toBe('none')
      expect(g.getAttribute('class')).toBe('highlights')
    })

    it('accepts custom class name', () => {
      const g = createOverlay('play-overlay')
      expect(g.getAttribute('class')).toBe('play-overlay')
    })
  })

  describe('paintHighlight', () => {
    it('appends a rect with correct bbox and color', () => {
      const overlay = mockElement('g')
      paintHighlight(overlay, { x: 10, y: 20, width: 40, height: 40 }, '#ff0000')
      expect(overlay.childNodes.length).toBe(1)
      const rect = overlay.firstChild
      expect(rect.tagName).toBe('rect')
      expect(rect.getAttribute('x')).toBe('10')
      expect(rect.getAttribute('y')).toBe('20')
      expect(rect.getAttribute('width')).toBe('40')
      expect(rect.getAttribute('height')).toBe('40')
      expect(rect.getAttribute('fill')).toBe('#ff0000')
    })

    it('does nothing when bbox is null', () => {
      const overlay = mockElement('g')
      paintHighlight(overlay, null, '#ff0000')
      expect(overlay.childNodes.length).toBe(0)
    })
  })

  describe('paintIndicator', () => {
    it('paints a circle for non-capture', () => {
      const overlay = mockElement('g')
      paintIndicator(overlay, { x: 0, y: 0, width: 50, height: 50 }, '#000', false)
      expect(overlay.childNodes.length).toBe(1)
      const circle = overlay.firstChild
      expect(circle.tagName).toBe('circle')
      expect(circle.getAttribute('cx')).toBe('25')
      expect(circle.getAttribute('cy')).toBe('25')
      expect(parseFloat(circle.getAttribute('r'))).toBeCloseTo(8, 0)
    })

    it('paints a rect for capture', () => {
      const overlay = mockElement('g')
      paintIndicator(overlay, { x: 10, y: 10, width: 40, height: 40 }, 'rgba(0,0,0,0.2)', true)
      expect(overlay.firstChild.tagName).toBe('rect')
      expect(overlay.firstChild.getAttribute('fill')).toBe('rgba(0,0,0,0.2)')
    })

    it('does nothing when bbox is null', () => {
      const overlay = mockElement('g')
      paintIndicator(overlay, null, '#000', false)
      expect(overlay.childNodes.length).toBe(0)
    })
  })

  describe('paintFog', () => {
    it('paints a fog rect with default color and opacity', () => {
      const overlay = mockElement('g')
      paintFog(overlay, { x: 5, y: 5, width: 30, height: 30 })
      const rect = overlay.firstChild
      expect(rect.tagName).toBe('rect')
      expect(rect.getAttribute('fill')).toBe('#1a1a2e')
      expect(rect.getAttribute('opacity')).toBe('1')
    })

    it('accepts custom color and opacity', () => {
      const overlay = mockElement('g')
      paintFog(overlay, { x: 0, y: 0, width: 10, height: 10 }, '#000', '0.5')
      expect(overlay.firstChild.getAttribute('fill')).toBe('#000')
      expect(overlay.firstChild.getAttribute('opacity')).toBe('0.5')
    })
  })
})
