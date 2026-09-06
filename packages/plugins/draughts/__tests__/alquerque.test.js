import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#161. Alquerque is the draughts family's ancestor and the one board in
// it that is not an ordinary grid: its lines run corner to corner and midpoint
// to midpoint, so half its points carry all four diagonals and half carry none.
// The plugin generated moves from its own direction table and never asked the
// board what it had drawn, so it offered diagonal moves from every point.
//
// The fix is not an Alquerque branch: the topology answers whether a line
// exists, and the plugin asks. On every other draughts board the answer is
// always yes, which is why nothing else changes.

const COLS = 5
const rc = (i) => [Math.trunc(i / COLS), i % COLS]
const drawsDiagonals = (r, c) => (r + c) % 2 === 0

// Each leg of a move must be a step or a hop along a line the board draws.
function legOnALine(from, to) {
  const [fr, fc] = rc(from)
  const [tr, tc] = rc(to)
  const dr = tr - fr
  const dc = tc - fc
  if (dr !== 0 && dc !== 0) {
    if (Math.abs(dr) !== Math.abs(dc)) return false
    return drawsDiagonals(fr, fc)
  }
  return true
}

function legsOf(move) {
  const stops = move.path ? [move.from, ...move.path] : [move.from, move.to]
  const legs = []
  for (let i = 0; i + 1 < stops.length; i++) legs.push([stops[i], stops[i + 1]])
  return legs
}

function play(seed, maxPlies = 600) {
  const game = createGameForFamily('draughts', { variant: 'alquerque', rngSeed: seed })
  const rng = createRng(seed)
  const offBoard = []
  let plies = 0
  let outcome = 'timeout'
  let kingsSeen = 0

  for (; plies < maxPlies; plies++) {
    const moves = game.getLegalMoves()
    if (!moves.length) { outcome = 'no-moves'; break }
    for (const move of moves) {
      for (const [from, to] of legsOf(move)) {
        if (!legOnALine(from, to)) offBoard.push(`${JSON.stringify(move)} leg ${from}->${to}`)
      }
    }
    const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
    if (!result || !result.ok) { outcome = 'rejected'; break }
    const state = game.getState()?.slice || game.getState()
    kingsSeen += state.board.filter(c => c && c.type === 'king').length
    if (result.winner !== undefined && result.winner !== null) { outcome = `winner:${result.winner}`; break }
  }
  return { plies, outcome, offBoard, kingsSeen, game }
}

describe('alquerque (engine#161)', () => {
  it('opens on 25 points with only the centre empty', () => {
    const state = createGameForFamily('draughts', { variant: 'alquerque', rngSeed: 1 }).getState()
    const board = (state?.slice || state).board
    expect(board).toHaveLength(25)
    expect(board.filter(Boolean)).toHaveLength(24)
    expect(board.map((cell, i) => (cell ? null : i)).filter(i => i !== null)).toEqual([12])
  })

  it('offers exactly the four pieces that stand on a line into the centre', () => {
    const game = createGameForFamily('draughts', { variant: 'alquerque', rngSeed: 1 })
    const moves = game.getLegalMoves()
    // The centre is (2,2), which carries diagonals, so its own side's four
    // neighbours along drawn lines are (2,3) orthogonally and (3,1) (3,2) (3,3).
    expect(moves.map(m => m.from).sort((a, b) => a - b)).toEqual([13, 16, 17, 18])
    expect(moves.every(m => m.to === 12)).toBe(true)
  })

  it('never offers a move along a line the board does not draw', () => {
    const runs = [1, 2, 3, 4, 5].map(seed => play(seed))
    expect(runs.flatMap(r => r.offBoard)).toEqual([])
    // A run that generated nothing proves nothing.
    expect(runs.reduce((n, r) => n + r.plies, 0)).toBeGreaterThan(50)
  })

  it('reaches a terminal position from every seed', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { outcome, plies } = play(seed)
      expect(outcome).not.toBe('timeout')
      expect(outcome).not.toBe('rejected')
      expect(plies).toBeGreaterThan(0)
    }
  })

  it('crowns nobody: there are no kings in Alquerque', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(play(seed).kingsSeen).toBe(0)
    }
  })

  it('leaves an ordinary draughts board playing exactly as before', () => {
    const game = createGameForFamily('draughts', { variant: 'english', rngSeed: 1 })
    const moves = game.getLegalMoves()
    expect(moves.length).toBe(7)
    expect(moves.every(m => {
      const [fr, fc] = [Math.trunc(m.from / 8), m.from % 8]
      const [tr, tc] = [Math.trunc(m.to / 8), m.to % 8]
      return Math.abs(fr - tr) === Math.abs(fc - tc)
    })).toBe(true)
  })
})
