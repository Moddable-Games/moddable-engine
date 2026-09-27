import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, getPlugin } from '../../../play/src/play.js'

// engine#157. Surakarta's loops are arcs in the grid topology, declared in the
// rulebook, and a capture is a `rail`: along the lines, through at least one
// arc, onto the first piece met. Row 0 is rank 6.

const COLS = 6
const at = (sq) => (6 - Number(sq.slice(1))) * COLS + 'abcdef'.indexOf(sq[0])
const alg = (i) => 'abcdef'[i % COLS] + (6 - Math.floor(i / COLS))
const WHITE = 0
const BLACK = 1

function position(pieces, extra = {}) {
  const g = createGameForFamily('surakarta', { variant: 'standard', rngSeed: 1 })
  const slice = g.getState().slice
  const board = slice.board.map(() => null)
  for (const [sq, owner] of pieces) board[at(sq)] = { type: 'stone', owner }
  g.loadState({ slice: { ...slice, board, ...extra }, players: { currentIndex: WHITE } })
  return g
}

const capturesFrom = (g, sq) => g.getLegalMoves().filter(m => m.from === at(sq) && m.capture).map(m => alg(m.to)).sort()

describe('Surakarta plays through the chess plugin (engine#157)', () => {
  it('is handed to the plugin its rulebook names', () => {
    expect(getPlugin('surakarta')?.factory).toBe(getPlugin('chess').factory)
  })

  it('opens with sixteen steps and nothing to capture', () => {
    const g = createGameForFamily('surakarta', { variant: 'standard', rngSeed: 1 })
    const moves = g.getLegalMoves()
    expect(moves).toHaveLength(16)
    expect(moves.some(m => m.capture)).toBe(false)
  })

  it('steps one point in any of the eight directions', () => {
    const g = position([['c3', WHITE], ['f6', BLACK]])
    const steps = g.getLegalMoves().filter(m => m.from === at('c3')).map(m => alg(m.to)).sort()
    expect(steps).toEqual(['b2', 'b3', 'b4', 'c2', 'c4', 'd2', 'd3', 'd4'])
  })
})

describe('capture along the loops', () => {
  it('goes round an arc and takes the first piece met', () => {
    // South off b1, round the inner loop, in along rank 2 to d2.
    const g = position([['b1', WHITE], ['d2', BLACK]])
    expect(capturesFrom(g, 'b1')).toEqual(['d2'])
  })

  it('is stopped by any piece on the way', () => {
    // c2 closes rank 2 from the west and e3 closes the e-file on the way
    // round from the other side.
    const g = position([['b1', WHITE], ['d2', BLACK], ['c2', WHITE], ['e3', WHITE]])
    expect(capturesFrom(g, 'b1')).toEqual([])
  })

  it('takes nothing along a line that has not been through an arc', () => {
    // d2 is next to c2 on rank 2, but the only ways round are shut.
    const g = position([['c2', WHITE], ['d2', BLACK], ['b1', WHITE], ['c1', WHITE], ['c3', WHITE]])
    expect(capturesFrom(g, 'c2')).toEqual([])
  })

  it('never captures from a corner, which no loop reaches', () => {
    const g = position([['a1', WHITE], ['b1', BLACK], ['a2', BLACK]])
    expect(capturesFrom(g, 'a1')).toEqual([])
  })

  it('gives up a loop that finds nothing', () => {
    const g = position([['b3', WHITE], ['f6', BLACK]])
    expect(capturesFrom(g, 'b3')).toEqual([])
  })
})

describe('the end of the game', () => {
  it('is won by taking the last enemy piece', () => {
    const g = position([['b1', WHITE], ['d2', BLACK]])
    g.applyMove({ from: at('b1'), to: at('d2'), capture: true })
    expect(g.checkWin()).toBe(WHITE)
  })

  it('goes to the side with more pieces when play stops making progress', () => {
    const g = position([['a1', WHITE], ['f1', WHITE], ['f6', BLACK]], { halfmoveClock: 99 })
    g.applyMove({ from: at('a1'), to: at('a2') })
    expect(g.checkWin()).toBe(WHITE)
  })
})
