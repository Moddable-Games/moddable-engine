import { createHexTopology } from '../../topologies/hex/src/topology-hex.js'
import { serializeLayout } from '../src/serialize-layout.js'

describe('hex render pipeline proof', () => {
  it('Glinski-style hexagonal board produces valid SVG', () => {
    const topo = createHexTopology({ radius: 5, orientation: 'flat' })
    const colors = { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }

    const layout = topo.renderLayout({
      cellSize: 22,
      scale: 0.95,
      background: { fill: colors.background, rx: 6 },
      cellFill: (q, r) => {
        const mod = (((q - r) % 3) + 3) % 3
        return mod === 0 ? colors.lightHex : mod === 1 ? colors.midHex : colors.darkHex
      },
      cellStroke: { color: colors.stroke, width: 1 },
    })

    const svg = serializeLayout(layout, { title: 'Glinski' })

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('<title>Glinski</title>')
    expect(svg).toContain('<rect')
    expect(svg).toContain('<polygon')
    expect(svg).toContain('data-sq="0,0"')
    expect(svg).toContain('board-cell')
    expect(svg).toContain('</svg>')

    const polygonCount = (svg.match(/<polygon/g) || []).length
    expect(polygonCount).toBe(91 * 2) // 91 visible + 91 hit targets
  })

  it('rhombus Hex board with frame produces valid SVG', () => {
    const topo = createHexTopology({ size: 11, shape: 'rhombus', orientation: 'pointy' })
    const colors = { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)' }

    const layout = topo.renderLayout({
      cellSize: 20,
      scale: 0.95,
      frame: { stroke: '#6b4226', strokeWidth: 14, scale: 1.05 },
      cellFill: (q, r) => {
        const s = q + r
        return s % 3 === 0 ? colors.lightHex : s % 3 === 1 ? colors.darkHex : colors.midHex
      },
      cellStroke: { color: colors.stroke, width: 1 },
    })

    const svg = serializeLayout(layout, { title: 'Hex 11x11' })

    expect(svg).toContain('<svg')
    expect(svg).toContain('<line')
    expect(svg).not.toContain('<rect') // no background in frame mode
    const lineCount = (svg.match(/<line/g) || []).length
    expect(lineCount).toBeGreaterThan(0)

    const polygonCount = (svg.match(/<polygon/g) || []).length
    expect(polygonCount).toBe(121 * 2) // 121 cells + 121 hit targets
  })

  it('custom hex array with pieces produces valid SVG', () => {
    const topo = createHexTopology({ radius: 3, orientation: 'flat' })
    const hexes = []
    for (let q = -2; q <= 2; q++) {
      const r1 = Math.max(-2, -q - 2)
      const r2 = Math.min(2, -q + 2)
      for (let r = r1; r <= r2; r++) hexes.push({ q, r })
    }

    const layout = topo.renderLayout({
      hexes,
      cellSize: 30,
      orientation: 'flat',
      background: { fill: '#2c2c2c', rx: 6 },
      cellFill: () => '#f0d9b5',
      cellStroke: { color: 'rgba(0,0,0,0.2)', width: 1 },
    })

    const pieces = { '0,0': { type: 'wK' }, '1,0': { type: 'bQ' } }
    const pieceImages = { wK: '/pieces/wK.svg', bQ: '/pieces/bQ.svg' }

    const svg = serializeLayout(layout, { title: 'Custom', pieces, pieceImages, tileSize: 48 })

    expect(svg).toContain('wK.svg')
    expect(svg).toContain('bQ.svg')
    expect(svg).toContain('pointer-events="none"')
  })

  it('hex with clipPath defs renders correctly', () => {
    const topo = createHexTopology({ radius: 2, orientation: 'pointy' })

    const layout = topo.renderLayout({
      cellSize: 30,
      cellFill: () => '#666',
      cellImage: (q, r) => q === 0 && r === 0 ? '/tiles/forest.png' : null,
    })

    const svg = serializeLayout(layout, { title: 'Terrain' })

    expect(svg).toContain('<defs>')
    expect(svg).toContain('<clipPath')
    expect(svg).toContain('clip-0-0')
    expect(svg).toContain('</defs>')
    expect(svg).toContain('<image')
    expect(svg).toContain('forest.png')
  })

  it('overlays and centre marker render in SVG', () => {
    const topo = createHexTopology({ radius: 5, orientation: 'pointy' })

    const layout = topo.renderLayout({
      cellSize: 22,
      cellFill: () => '#ccc',
      overlays: [{ q: 1, r: 1, color: '#C62828', text: '6' }],
      centreMarker: { q: 0, r: 0, text: '★', fill: 'gold' },
    })

    const svg = serializeLayout(layout, { title: 'Agon' })

    expect(svg).toContain('<circle')
    expect(svg).toContain('#C62828')
    expect(svg).toContain('>6<')
    expect(svg).toContain('gold')
  })
})
