import { createGridTopology } from '../src/topology-grid.js'

// engine#159. Both twisted boards had the half-twist on the wrong axis.
//
// Moebius Chess joins rank 11 to rank 12 mirrored across the files -
// chessvariants.com/shape.dir/x_moeb.html: "a11 would join h12, b11 would join
// g12, and so on" - and the engine instead twisted the FILE wrap and gave
// mobius no rank wrap at all, so the feature the variant is named for was
// absent. Klein Bottle Chess carried the same twisted file wrap, which its own
// frontmatter says it should not have: its files join plainly, as in
// Cylindrical Chess.
//
// The two differ in what happens to the other pair of edges, and that is the
// definition of the surfaces rather than a preference. A Moebius strip has one
// boundary, so a and h are ordinary board edges; the same primary source says
// so. A Klein bottle has none, so its files join.

const ROWS = 14
const COLS = 8

function topo(wrap) {
  return createGridTopology({ rows: ROWS, cols: COLS, wrap })
}

describe('the half-twist is on the rank seam', () => {
  it.each(['mobius', 'klein-bottle'])('%s mirrors the file when crossing ranks', (wrap) => {
    const t = topo(wrap)
    expect(t.wrapCoords(ROWS, 0)).toEqual([0, COLS - 1])
    expect(t.wrapCoords(ROWS, 3)).toEqual([0, 4])
    expect(t.wrapCoords(ROWS, COLS - 1)).toEqual([0, 0])
  })

  it.each(['mobius', 'klein-bottle'])('%s mirrors going the other way too', (wrap) => {
    const t = topo(wrap)
    expect(t.wrapCoords(-1, 0)).toEqual([ROWS - 1, COLS - 1])
  })

  it('cylinder has no rank seam at all, and is unchanged', () => {
    expect(topo('cylinder').wrapCoords(ROWS, 3)).toEqual([ROWS, 3])
  })
})

describe('the file edges are what separate the two surfaces', () => {
  it('mobius leaves a and h as ordinary board edges, because a strip has one', () => {
    const t = topo('mobius')
    expect(t.wrapCoords(5, COLS)).toEqual([5, COLS])
    expect(t.isValid([5, COLS])).toBe(false)
    expect(t.isValid([5, -1])).toBe(false)
  })

  it('klein-bottle joins the files plainly, with no row mirror', () => {
    const t = topo('klein-bottle')
    expect(t.wrapCoords(5, COLS)).toEqual([5, 0])
    expect(t.wrapCoords(0, COLS)).toEqual([0, 0])
    expect(t.wrapCoords(5, -1)).toEqual([5, COLS - 1])
  })

  it('cylinder joins the files plainly, as klein-bottle now does', () => {
    const t = topo('cylinder')
    expect(t.wrapCoords(5, COLS)).toEqual([5, 0])
  })

  // The bug this replaces: crossing a file edge used to flip the row.
  it.each(['mobius', 'klein-bottle', 'cylinder'])('%s never flips the row on a file crossing', (wrap) => {
    const t = topo(wrap)
    for (const row of [0, 5, ROWS - 1]) {
      const [wr] = t.wrapCoords(row, COLS)
      expect(wr).toBe(row)
    }
  })
})

describe('the untwisted wraps are untouched', () => {
  it('torus wraps both plainly', () => {
    const t = topo('torus')
    expect(t.wrapCoords(ROWS, 3)).toEqual([0, 3])
    expect(t.wrapCoords(5, COLS)).toEqual([5, 0])
  })

  it('a board with no wrap wraps nothing', () => {
    const t = topo(false)
    expect(t.wrapCoords(ROWS, 3)).toEqual([ROWS, 3])
    expect(t.wrapCoords(5, COLS)).toEqual([5, COLS])
  })
})
