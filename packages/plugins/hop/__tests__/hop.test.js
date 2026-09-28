import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, getPlugin } from '../../../play/src/play.js'
import { createHopPlugin } from '../index.js'

// engine#153. Halma and Stern-Halma are one hop plugin, named in their
// rulebooks: a step, or a chain of hops that captures nothing, and a race to
// fill the camp opposite. Halma's board is a 16 x 16 grid; Stern-Halma's is
// the star, holes h1-h121, which the graph topology lays on a lattice.

const WHITE = 0
const BLACK = 1
const sq = (r, c) => r * 16 + c

function game(family, variant) {
  return createGameForFamily(family, { variant, rngSeed: 1 })
}

function position(family, variant, pieces, toMove = WHITE) {
  const g = game(family, variant)
  const board = {}
  for (const [cell, owner] of pieces) board[cell] = { type: 'piece', owner }
  g.loadState({ slice: { ...g.getState().slice, board, toMove }, players: { currentIndex: toMove } })
  return g
}

const targets = (g, from) => g.getLegalMoves().filter(m => m.from === from).map(m => m.to).sort((a, b) => (a > b ? 1 : -1))

describe('the hopping games are played by one plugin their rulebooks name', () => {
  it.each(['halma', 'stern-halma'])('%s', (family) => {
    expect(getPlugin(family)?.factory).toBe(createHopPlugin)
  })

  it('opens every game with its camps full and each move onto an empty cell', () => {
    for (const [family, variant, seats, pieces] of [['halma', 'standard-2p', 2, 19], ['halma', 'standard-4p', 4, 13], ['stern-halma', 'standard-6p', 6, 10]]) {
      const g = game(family, variant)
      const board = g.getState().slice.board
      for (let seat = 0; seat < seats; seat++) {
        expect(Object.values(board).filter(p => p.owner === seat)).toHaveLength(pieces)
      }
      for (const m of g.getLegalMoves()) expect(board[m.to]).toBeUndefined()
    }
  })

  it.each([['stern-halma', 'standard-3p', 3], ['halma', 'standard-4p', 4], ['stern-halma', 'standard-4p', 4], ['stern-halma', 'standard-6p', 6]])(
    '%s %s turns through all %i seats', (family, variant, seats) => {
      const g = game(family, variant)
      const seen = []
      for (let i = 0; i < seats * 2; i++) {
        seen.push(g.getState().players.currentIndex)
        g.applyMove(g.getLegalMoves()[0])
      }
      expect(seen).toEqual([...Array(seats).keys(), ...Array(seats).keys()])
    })
})

describe('Halma', () => {
  it('steps to any of the eight neighbours', () => {
    const g = position('halma', 'standard-2p', [[sq(7, 7), WHITE], [sq(0, 15), BLACK]])
    expect(targets(g, sq(7, 7))).toEqual([sq(6, 6), sq(6, 7), sq(6, 8), sq(7, 6), sq(7, 8), sq(8, 6), sq(8, 7), sq(8, 8)])
  })

  it('hops over any piece and captures nothing, chaining where it likes', () => {
    // Over Black on (7,8) to (7,9), then over White on (6,9) to (5,9).
    const g = position('halma', 'standard-2p', [[sq(7, 7), WHITE], [sq(7, 8), BLACK], [sq(6, 9), WHITE]])
    const hops = g.getLegalMoves().filter(m => m.from === sq(7, 7) && m.path)
    expect(hops.map(m => m.to)).toEqual(expect.arrayContaining([sq(7, 9), sq(5, 9)]))
    g.applyMove({ from: sq(7, 7), to: sq(5, 9) })
    const board = g.getState().slice.board
    expect(board[sq(7, 8)]).toEqual({ type: 'piece', owner: BLACK })
    expect(board[sq(5, 9)].owner).toBe(WHITE)
  })

  it('never follows a step with a hop in the same turn', () => {
    // (7,7) steps to (7,8); from there a hop over (7,9) would reach (7,10).
    const g = position('halma', 'standard-2p', [[sq(7, 7), WHITE], [sq(7, 9), BLACK]])
    expect(targets(g, sq(7, 7))).not.toContain(sq(7, 10))
  })

  it('keeps a piece in the camp it has reached', () => {
    // (4,0) is the tip of the camp's last row; (3,1) is in the camp, (4,1),
    // (5,0) and (5,1) are outside it.
    const g = position('halma', 'standard-2p', [[sq(4, 0), WHITE], [sq(15, 0), BLACK]])
    expect(targets(g, sq(4, 0))).toEqual([sq(3, 0), sq(3, 1)])
    const outside = position('halma', 'standard-2p', [[sq(5, 0), WHITE], [sq(15, 0), BLACK]])
    expect(targets(outside, sq(5, 0))).toEqual(expect.arrayContaining([sq(4, 0), sq(5, 1), sq(6, 0)]))
  })

  it('is won by filling the camp opposite, and not before', () => {
    const goal = []
    for (const [r, w] of [[0, 5], [1, 5], [2, 5], [3, 3], [4, 1]]) for (let c = 0; c < w; c++) goal.push(sq(r, c))
    const g = position('halma', 'standard-2p', [...goal.slice(0, -1).map(c => [c, WHITE]), [sq(5, 1), WHITE], [sq(15, 15), BLACK]])
    g.applyMove({ from: sq(5, 1), to: sq(5, 2) })
    expect(g.checkWin()).toBe(null)
    const again = position('halma', 'standard-2p', [...goal.slice(0, -1).map(c => [c, WHITE]), [sq(5, 0), WHITE], [sq(15, 15), BLACK]])
    again.applyMove({ from: sq(5, 0), to: sq(4, 0) })
    expect(again.checkWin()).toBe(WHITE)
  })
})

describe('Stern-Halma on the star', () => {
  // h61 is the centre hole, in a row of nine (h57-h65); the rows above and
  // below are ten wide (h47-h56, h66-h75), so its neighbours there are h51,
  // h52, h70 and h71.
  it('steps to the six neighbours of a hole', () => {
    const g = position('stern-halma', 'standard-2p', [['h61', WHITE], ['h1', BLACK]])
    expect(targets(g, 'h61')).toEqual(['h51', 'h52', 'h60', 'h62', 'h70', 'h71'])
  })

  it('hops straight, never round a corner', () => {
    // Over h62 the only landing is h63, in line.
    const g = position('stern-halma', 'standard-2p', [['h61', WHITE], ['h62', BLACK], ['h1', BLACK]])
    const hops = g.getLegalMoves().filter(m => m.from === 'h61' && m.path).map(m => m.to)
    expect(hops).toEqual(['h63'])
  })

  it('hops from any distance in Super Chinese Checkers, landing as far beyond', () => {
    // h59 .. h61 (hurdle at two along) .. lands on h63, with h60 and h62 empty.
    const g = position('stern-halma', 'super-chinese-checkers', [['h59', WHITE], ['h61', BLACK], ['h1', BLACK]])
    expect(g.getLegalMoves().filter(m => m.from === 'h59' && m.path).map(m => m.to)).toContain('h63')
    const plain = position('stern-halma', 'standard-2p', [['h59', WHITE], ['h61', BLACK], ['h1', BLACK]])
    expect(plain.getLegalMoves().filter(m => m.from === 'h59' && m.path)).toEqual([])
    const blocked = position('stern-halma', 'super-chinese-checkers', [['h59', WHITE], ['h61', BLACK], ['h62', BLACK], ['h1', BLACK]])
    expect(blocked.getLegalMoves().filter(m => m.from === 'h59' && m.path).map(m => m.to)).not.toContain('h63')
  })
})
