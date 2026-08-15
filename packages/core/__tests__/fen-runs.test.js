/**
 * One reader for a FEN rank, and the four that used to disagree.
 *
 * A 22-wide board built in the create page drew correctly and played with every
 * piece after the first gap in the wrong place. Nothing threw, because each
 * reader had its own idea of what "20" meant.
 */

import { parseRankRuns, parsePositionRuns } from '../src/fen-runs.js'
import { fenToPosition } from '../../render/src/render-engine.js'
import { createGridTopology } from '../../topologies/grid/src/topology-grid.js'

describe('a digit run is one number', () => {
  test('single digits still work', () => {
    expect(parseRankRuns('r6r')).toEqual([{ symbol: 'r' }, { skip: 6 }, { symbol: 'r' }])
  })

  test('two digits are one count, not two', () => {
    expect(parseRankRuns('20qk')).toEqual([{ skip: 20 }, { symbol: 'q' }, { symbol: 'k' }])
  })

  test('three digits too, which no previous reader handled', () => {
    expect(parseRankRuns('100q')).toEqual([{ skip: 100 }, { symbol: 'q' }])
  })

  test('a zero is a count of zero, not a piece called nought', () => {
    // chess-plugin.js tested `ch >= '1'`, so the 0 in "20" fell through to the
    // symbol lookup and consumed a cell.
    expect(parseRankRuns('0q')).toEqual([{ skip: 0 }, { symbol: 'q' }])
  })

  test('bracketed symbols survive', () => {
    expect(parseRankRuns('2[wN]3')).toEqual([{ skip: 2 }, { symbol: 'wN' }, { skip: 3 }])
  })

  test('ranks split on the slash', () => {
    expect(parsePositionRuns('20qk/22')).toEqual([
      [{ skip: 20 }, { symbol: 'q' }, { symbol: 'k' }],
      [{ skip: 22 }],
    ])
  })
})

describe('every reader agrees on a board wider than nine files', () => {
  // Mark's Long Chess: 4 rows, 22 columns.
  const SETUP = '20qk/21q/Q21/KQ20'
  const ROWS = 4, COLS = 22

  test('the renderer places the pieces on the last two files', () => {
    const pos = fenToPosition(SETUP, ROWS, COLS)
    // column 20 is file 'u', 21 is 'v'; rank 4 is the top row
    expect(pos.u4).toBe('q')
    expect(pos.v4).toBe('k')
    expect(pos.v3).toBe('q')
    expect(pos.a2).toBe('Q')
    expect(pos.a1).toBe('K')
    expect(pos.b1).toBe('Q')
    expect(Object.keys(pos)).toHaveLength(6)
  })

  test('the grid topology puts them on the same cells', () => {
    const topo = createGridTopology({ rows: ROWS, cols: COLS })
    const vocabulary = {
      king: { symbols: { 0: 'K', 1: 'k' } },
      queen: { symbols: { 0: 'Q', 1: 'q' } },
    }
    const cells = topo.parsePosition(SETUP, vocabulary)
    const occupied = []
    for (let i = 0; i < cells.length; i++) if (cells[i]) occupied.push(i)
    // row 0: cols 20, 21 · row 1: col 21 · row 2: col 0 · row 3: cols 0, 1
    expect(occupied).toEqual([20, 21, 21 + COLS, 2 * COLS, 3 * COLS, 3 * COLS + 1])
    expect(cells[20].type).toBe('queen')
    expect(cells[21].type).toBe('king')
  })

  test('and no piece lands on the far left of the top rank', () => {
    // The old chess-plugin reader produced exactly that: skip 2, a null for the
    // "0", then the queen and king on files c and d.
    const pos = fenToPosition(SETUP, ROWS, COLS)
    expect(pos.c4).toBeUndefined()
    expect(pos.d4).toBeUndefined()
  })
})
