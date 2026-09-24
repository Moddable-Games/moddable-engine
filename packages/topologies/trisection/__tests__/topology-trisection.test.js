import { createTrisectionTopology, trisectionMode, cellKey } from '../index.js'

// engine#26. The hexagonal-trisection board: six quadrilaterals round the
// centre, two to a seat. What these check is the part nothing else can see -
// that lines run straight across the seams between sectors, that the centre
// forks the diagonals and nothing else, and that the colours hold.

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]

describe('hexagonal-trisection, cells', () => {
  const t = createTrisectionTopology({ type: 'hexagonal-trisection' })
  const all = t.getAllCells()

  it('is the 96-cell board: three halves of 4 ranks by 8 files', () => {
    expect(all.length).toBe(96)
    for (const seat of [0, 1, 2]) expect(all.filter(k => t.seatOf(k) === seat).length).toBe(32)
    expect(all).toContain('Aa1')
    expect(all).toContain('Ch4')
    expect(cellKey(1, 4, 1)).toBe('Be2')
  })

  it('joins cells symmetrically, with six corners and 36 edge cells', () => {
    for (const k of all) for (const n of t.neighbours(k)) expect(t.neighbours(n)).toContain(k)
    const degrees = {}
    for (const k of all) degrees[t.neighbours(k).length] = (degrees[t.neighbours(k).length] || 0) + 1
    expect(degrees).toEqual({ 2: 6, 3: 36, 4: 54 })
  })

  it('puts six cells round the centre, each touching the next', () => {
    const ring = ['Ad4', 'Ae4', 'Bd4', 'Be4', 'Cd4', 'Ce4']
    ring.forEach((k, i) => {
      expect(t.neighbours(k)).toContain(ring[(i + 1) % 6])
      expect(t.neighbours(k)).not.toContain(ring[(i + 3) % 6])
    })
  })

  it('runs a file on into the next seat\'s half, where it turns to meet it', () => {
    // A's files a-d lead into C's e-h, and e-h into B's a-d, each counting
    // back down toward its own back rank.
    expect(t.rays('Ad2', [[1, 0]])).toEqual([['Ad3', 'Ad4', 'Ce4', 'Ce3', 'Ce2', 'Ce1']])
    expect(t.rays('Ae2', [[1, 0]])).toEqual([['Ae3', 'Ae4', 'Bd4', 'Bd3', 'Bd2', 'Bd1']])
    expect(t.rays('Ah3', [[1, 0]])).toEqual([['Ah4', 'Ba4', 'Ba3', 'Ba2', 'Ba1']])
    // A rank stays inside its own seat's half.
    expect(t.rays('Aa1', [[0, 1]])).toEqual([['Ab1', 'Ac1', 'Ad1', 'Ae1', 'Af1', 'Ag1', 'Ah1']])
  })

  it('never forks a straight line', () => {
    for (const k of all) expect(t.rays(k, 'orthogonal').length).toBe(4)
  })

  it('forks a diagonal at the centre, into the two cells of its own colour', () => {
    const rays = t.rays('Ac3', [[1, 1]])
    expect(rays).toEqual([
      ['Ad4', 'Cd4', 'Cc3', 'Cb2', 'Ca1'],
      ['Ad4', 'Bd4', 'Bc3', 'Bb2', 'Ba1'],
    ])
    // Away from the centre a diagonal goes on to exactly one cell.
    expect(t.rays('Aa1', [[1, 1]])).toEqual([['Ab2', 'Ac3', 'Ad4', 'Cd4', 'Cc3', 'Cb2', 'Ca1'], ['Ab2', 'Ac3', 'Ad4', 'Bd4', 'Bc3', 'Bb2', 'Ba1']])
    expect(t.rays('Ah1', [[1, -1]])).toEqual([['Ag2', 'Af3', 'Ae4', 'Ce4', 'Cf3', 'Cg2', 'Ch1'], ['Ag2', 'Af3', 'Ae4', 'Be4', 'Bf3', 'Bg2', 'Bh1']])
  })

  it('keeps every diagonal on one colour, and every knight changes it', () => {
    for (const k of all) {
      for (const ray of t.rays(k, 'diagonal')) for (const c of ray) expect(t.colourOf(c)).toBe(t.colourOf(k))
      for (const c of t.leapTargets(k, KNIGHT)) expect(t.colourOf(c)).not.toBe(t.colourOf(k))
    }
  })

  it('colours every seat\'s a1 dark and h1 light, as a chessboard does', () => {
    for (const s of 'ABC') {
      expect(t.colourOf(`${s}a1`)).toBe(0)
      expect(t.colourOf(`${s}h1`)).toBe(1)
    }
  })

  it('leaps a knight as on a chessboard, away from the centre', () => {
    expect(t.leapTargets('Ab1', KNIGHT).sort()).toEqual(['Aa3', 'Ac3', 'Ad2'])
    expect(t.leapTargets('Ae2', KNIGHT).sort()).toEqual(['Ac1', 'Ac3', 'Ad4', 'Af4', 'Ag1', 'Ag3'])
  })

  it('sends a pawn toward the centre at home and away from it abroad', () => {
    const red = t.pawnGeometry(0)
    expect(t.step('Ae3', red.forward)).toBe('Ae4')
    expect(t.step('Ae4', red.forward)).toBe('Bd4')
    expect(t.step('Bd4', red.forward)).toBe('Bd3')
    // The same cell, another seat's pawn: forward is the other way.
    expect(t.step('Bd4', t.pawnGeometry(1).forward)).toBe('Ae4')
  })

  it('offers a pawn both captures past the centre', () => {
    const red = t.pawnGeometry(0)
    const targets = red.captures.map(c => t.step('Ad4', c)).filter(Boolean).sort()
    expect(targets).toEqual(['Bd4', 'Cd4', 'Cf4'])
  })

  it('starts pawns on their own second rank and promotes them on anyone else\'s first', () => {
    const red = t.pawnGeometry(0)
    expect(red.startCells.sort()).toEqual(['Aa2', 'Ab2', 'Ac2', 'Ad2', 'Ae2', 'Af2', 'Ag2', 'Ah2'])
    expect(red.promotionCells.length).toBe(16)
    expect(red.promotionCells.every(k => t.rankOf(k) === 0 && t.seatOf(k) !== 0)).toBe(true)
  })

  it('names each seat\'s back rank from its a-file', () => {
    expect(t.backRank(2)).toEqual(['Ca1', 'Cb1', 'Cc1', 'Cd1', 'Ce1', 'Cf1', 'Cg1', 'Ch1'])
  })

  const vocabulary = {
    king: { symbols: { 0: 'rK', 1: 'gK', 2: 'bK' } },
    pawn: { symbols: { 0: 'rP', 1: 'gP', 2: 'bP' } },
  }

  it('reads a position by ranks, one block per seat, front rank first', () => {
    const board = t.parsePosition('4[rK]3/8/8/8/8/8/[gP]7/8/8/8/8/7[bK]', vocabulary)
    expect(board).toEqual({
      Ae4: { type: 'king', owner: 0 },
      Ba2: { type: 'pawn', owner: 1 },
      Ch1: { type: 'king', owner: 2 },
    })
  })

  it('reads and writes the keyed form the play page uses', () => {
    const board = t.parsePosition('Ae1:rK,Ba2:gP,Zz9:bK', vocabulary)
    expect(board).toEqual({ Ae1: { type: 'king', owner: 0 }, Ba2: { type: 'pawn', owner: 1 } })
    expect(t.serializePosition(board, vocabulary)).toBe('Ae1:rK,Ba2:gP')
  })
})

describe('hexagonal-trisection, points', () => {
  it('takes xiangqi\'s intersections as a request for points', () => {
    expect(trisectionMode({ layout: 'intersections' })).toBe('points')
    expect(trisectionMode({})).toBe('cells')
    expect(trisectionMode({ layout: 'intersections', mode: 'cells' })).toBe('cells')
  })

  // San-kwo-k'i arrives as xiangqi's 10 x 9 intersections under this type, and
  // its sources do not say how many ranks a sector has. It must not quietly
  // become a board of some guessed size.
  it('refuses to guess the size of a point board', () => {
    expect(() => createTrisectionTopology({ type: 'hexagonal-trisection', rows: 10, cols: 9, layout: 'intersections' }))
      .toThrow(/needs its `size` declared/)
  })

  it('lays the same lines out as points when told the size', () => {
    const t = createTrisectionTopology({ mode: 'points', size: 4 })
    // Six lines meet at the centre, and each runs straight on to the edge.
    expect(t.neighbours('O').length).toBe(6)
    expect(t.rays('O').map(r => r.length)).toEqual([4, 4, 4, 4, 4, 4])
    for (const k of t.getAllCells()) for (const n of t.neighbours(k)) expect(t.neighbours(n)).toContain(k)
    // 3 seats x 9 x 5 points, less the ones two sectors share.
    expect(t.getCellCount()).toBe(121)
  })
})
