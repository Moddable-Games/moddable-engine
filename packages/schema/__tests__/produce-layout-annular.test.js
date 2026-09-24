import { produceLayout } from '../src/produce-layout.js'
import { renderFromEngine } from '../../render/index.js'

// engine#27. A grid whose files wrap may be drawn as rings. It stays the same
// grid - the same cells, the same ids, the same moves - so what is checked
// here is that the drawing is the corpus's board and nothing else changed.

const ring = (extra = {}) => ({
  topology: { type: 'grid', rows: 4, cols: 16, wrap: 'files' },
  render: { cellSize: 40, mode: 'annular', ...extra },
})

const centreOf = (layout) => ({ x: layout.config.width / 2, y: layout.config.height / 2 })
const cellAt = (layout, id) => layout.config.cells.find(c => c.id === id)
const radius = (layout, id) => {
  const c = centreOf(layout), p = cellAt(layout, id)
  return Math.hypot(p.x - c.x, p.y - c.y)
}

describe('annular render mode', () => {
  it('draws only a board whose files join round', () => {
    expect(produceLayout(ring()).type).toBe('annular')
    expect(produceLayout({ ...ring(), topology: { type: 'grid', rows: 4, cols: 16, wrap: 'torus' } }).type).toBe('annular')
    // An ordinary board asking for rings would be drawn with a join that is
    // not there, so it stays flat.
    expect(produceLayout({ ...ring(), topology: { type: 'grid', rows: 8, cols: 8 } }).type).toBe('grid')
  })

  it('keeps every cell\'s id, one wedge per square', () => {
    const layout = produceLayout(ring())
    const ids = layout.config.cells.map(c => c.id)
    expect(ids.length).toBe(64)
    expect(new Set(ids).size).toBe(64)
    expect(ids).toContain('a1')
    expect(ids).toContain('p4')
    const hits = layout.config.elements.filter(e => e.attrs['data-sq']).map(e => e.attrs['data-sq'])
    expect(hits.sort()).toEqual([...ids].sort())
  })

  // "The engine.setup FEN encodes this ring-by-ring, highest ring (4,
  // outermost) first down to ring 1 (innermost)."
  it('puts the first row outermost and rank 1 innermost', () => {
    const layout = produceLayout(ring())
    expect(radius(layout, 'a4')).toBeGreaterThan(radius(layout, 'a3'))
    expect(radius(layout, 'a2')).toBeGreaterThan(radius(layout, 'a1'))
  })

  it('runs the files anticlockwise from the top, so the middle files are at the bottom', () => {
    const layout = produceLayout(ring())
    const c = centreOf(layout)
    const below = (id) => cellAt(layout, id).y > c.y
    for (const f of 'efghijkl') expect(below(`${f}1`)).toBe(true)
    for (const f of 'abcdmnop') expect(below(`${f}1`)).toBe(false)
    // Seen from the bottom, h is left of i, as on a chessboard.
    expect(cellAt(layout, 'h1').x).toBeLessThan(cellAt(layout, 'i1').x)
  })

  it('makes the inner ring\'s squares as wide as they are deep', () => {
    const layout = produceLayout(ring())
    const a = cellAt(layout, 'a1'), b = cellAt(layout, 'b1')
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(40, 0)
  })

  it('turns round for `rotation`, keeping the ids', () => {
    const plain = produceLayout(ring())
    const turned = produceLayout(ring({ rotation: 180 }))
    const c = centreOf(plain)
    const a = cellAt(plain, 'h1'), b = cellAt(turned, 'h1')
    expect(b.x).toBeCloseTo(2 * c.x - a.x, 1)
    expect(b.y).toBeCloseTo(2 * c.y - a.y, 1)
  })

  it('colours squares as the flat board does', () => {
    const layout = produceLayout(ring({ ops: [{ op: 'cells', pattern: 'checkered', light: '#fff', dark: '#000' }] }))
    const fill = (id) => layout.config.elements.find(e => e.attrs['data-sq'] === id).attrs.fill
    // Row 0 is the fourth rank: a4 is (0, 0), light on the flat board too.
    expect(fill('a4')).toBe('#fff')
    expect(fill('b4')).toBe('#000')
    expect(fill('a3')).toBe('#000')
  })

  const board = {
    ...ring(),
    setup: 'r15/16/16/15K',
    players: ['white', 'black'],
  }
  const images = { wK: 'king.svg', bR: 'rook.svg', K: 'king.svg', r: 'rook.svg' }
  const imageAt = (svg, href) => {
    const m = svg.match(new RegExp(`<image href="${href}" x="([\\d.]+)" y="([\\d.]+)"`))
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null
  }

  it('stands each piece in its own wedge', () => {
    const svg = renderFromEngine(board, { pieceImages: images })
    const layout = produceLayout(board)
    const king = imageAt(svg, 'king.svg'), rook = imageAt(svg, 'rook.svg')
    expect(king).not.toBeNull()
    expect(rook).not.toBeNull()
    expect(king.x + 20).toBeCloseTo(cellAt(layout, 'p1').x, 0)
    expect(rook.y + 20).toBeCloseTo(cellAt(layout, 'a4').y, 0)
  })

  // A flat board flips by mirroring its squares. A ring flipped that way
  // would put its outer ring inside, so it turns round instead: the same
  // squares hold the same pieces, and nothing is drawn upside down.
  it('flips by turning round, with the pieces upright', () => {
    const svg = renderFromEngine(board, { pieceImages: images, flipped: true })
    const turned = produceLayout(ring({ rotation: 180 }))
    const king = imageAt(svg, 'king.svg')
    expect(king.x + 20).toBeCloseTo(cellAt(turned, 'p1').x, 0)
    expect(svg).not.toContain('rotate(')
    expect(svg).toContain('data-sq="a4"')
  })
})
