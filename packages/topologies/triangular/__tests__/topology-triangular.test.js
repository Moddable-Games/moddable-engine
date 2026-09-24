import { createTriangularTopology, readTriangularShape } from '../index.js'

// engine#173. Sankaku Shogi's board, read from its source's ASCII diagram,
// chessvariants.com/44.dir/sankaku-shogi.html:
//
//            __
//           /\  /\
//       8  /__\/__\
//         /\  /\  /\
//     7  /__\/__\/__\
//       /\  /\  /\  /\
//    6 /__\/__\/__\/__\
//      \  /\  /\  /\  /
//    5  \/__\/__\/__\/          and so on to rank 1
//
// "Orthogonal movement is through the above patterns of triangles. With each
// step being from one cell to another which shares a complete side."
// "Adjacent movement ... is the translation from one cell to another which
// connected either by side or point."

const SANKAKU = ['..AVA..', '.AVAVA.', 'AVAVAVA', 'VAVAVAV', 'AVAVAVA', 'VAVAVAV', '.VAVAV.', '..VAV..']

describe('triangular topology', () => {
  const t = createTriangularTopology({ shape: SANKAKU, cells: 44 })
  const all = t.getAllCells()

  it('is the source\'s board: 44 cells in ranks of 3, 5, 7, 7, 7, 7, 5 and 3', () => {
    expect(all.length).toBe(44)
    const widths = [8, 7, 6, 5, 4, 3, 2, 1].map(r => all.filter(k => k.endsWith(String(r))).length)
    expect(widths).toEqual([3, 5, 7, 7, 7, 7, 5, 3])
  })

  it('holds every square the source sets a piece on', () => {
    const setup = ['d1', 'c1', 'e1', 'b2', 'c2', 'e2', 'f2', 'd2', 'b3', 'c3', 'd3', 'e3', 'f3',
      'd8', 'c8', 'e8', 'b7', 'c7', 'e7', 'f7', 'd7', 'b6', 'c6', 'd6', 'e6', 'f6']
    for (const k of setup) expect(t.isValid(k)).toBe(true)
    expect(t.isValid('a1')).toBe(false)
    expect(t.isValid('a8')).toBe(false)
  })

  it('checks a stated size against the picture, and a picture against itself', () => {
    expect(() => createTriangularTopology({ shape: SANKAKU, cells: 23 })).toThrow(/declares 23 cells and its shape has 44/)
    expect(() => readTriangularShape(['AAV'])).toThrow(/two A cells side by side/)
    expect(() => readTriangularShape(['AXV'])).toThrow(/"X" is not A, V or \./)
    expect(() => createTriangularTopology({})).toThrow(/needs its `shape`/)
  })

  it('joins cells symmetrically, by side and by side or point', () => {
    for (const k of all) {
      for (const rel of ['orthogonal', 'adjacent']) {
        for (const n of t.neighbours(k, rel)) expect(t.neighbours(n, rel)).toContain(k)
      }
      expect(t.neighbours(k).length).toBeLessThanOrEqual(3)
      expect(t.neighbours(k, 'adjacent').length).toBeLessThanOrEqual(12)
    }
  })

  it('gives an inner cell three sides and twelve cells touching it', () => {
    expect(t.isUp('d4')).toBe(false)
    expect(t.neighbours('d4').sort()).toEqual(['c4', 'd5', 'e4'])
    expect(t.neighbours('d4', 'adjacent').length).toBe(12)
  })

  it('runs six orthogonal lines out of a cell, two along each strip, every step through a side', () => {
    const rays = t.rays('d4', 'orthogonal')
    expect(rays.length).toBe(6)
    expect(rays).toContainEqual(['e4', 'f4', 'g4'])
    expect(rays).toContainEqual(['c4', 'b4', 'a4'])
    for (const ray of rays) {
      let at = 'd4'
      for (const cell of ray) {
        expect(t.neighbours(at)).toContain(cell)
        at = cell
      }
    }
  })

  it('names the second orthogonal as two steps along each strip', () => {
    const second = t.leapTargets('d4', 'second-orthogonal').sort()
    const fromRays = t.rays('d4', 'orthogonal').filter(r => r.length >= 2).map(r => r[1]).sort()
    expect(second).toEqual(fromRays)
    expect(second.length).toBe(6)
  })

  it('reads a position rank by rank from the top, or keyed', () => {
    const vocabulary = { emperor: { symbols: { 0: 'EP', 1: 'ep' } } }
    expect(t.parsePosition('3[ep]3/7/7/7/7/7/7/3[EP]3', vocabulary))
      .toEqual({ d8: { type: 'emperor', owner: 1 }, d1: { type: 'emperor', owner: 0 } })
    expect(t.parsePosition('d1:EP,a1:ep', vocabulary)).toEqual({ d1: { type: 'emperor', owner: 0 } })
  })
})
