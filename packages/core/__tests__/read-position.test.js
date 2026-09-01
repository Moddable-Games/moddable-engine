/**
 * The single walk over a rank-based position string. Six callers used to do
 * this themselves and disagreed about brackets, about `+`, and about which
 * case is which seat.
 */
import { readPosition } from '../src/fen-runs.js'

const at = (r, c) => (cell) => cell.row === r && cell.col === c

describe('readPosition', () => {
  it('counts a digit run as empty cells', () => {
    const { cells, widths } = readPosition('r6r')
    expect(cells.map(c => c.col)).toEqual([0, 7])
    expect(widths).toEqual([8])
  })

  it('reads a multi-digit run as one number', () => {
    expect(readPosition('20').widths).toEqual([20])
  })

  it('treats a bracketed code as one cell', () => {
    const { cells } = readPosition('[ln]1[kn]')
    expect(cells.map(c => c.symbol)).toEqual(['ln', 'kn'])
    expect(cells.map(c => c.col)).toEqual([0, 2])
  })

  it('treats + as a modifier on the next symbol, not a cell', () => {
    const { cells, widths } = readPosition('+Pp')
    expect(cells).toEqual([
      { row: 0, col: 0, symbol: 'P', promoted: true },
      { row: 0, col: 1, symbol: 'p', promoted: false },
    ])
    expect(widths).toEqual([2])
  })

  it('promotes a bracketed code too', () => {
    const { cells } = readPosition('+[dk]')
    expect(cells).toEqual([{ row: 0, col: 0, symbol: 'dk', promoted: true }])
  })

  it('does not carry promotion across an empty run', () => {
    const { cells } = readPosition('+1p')
    expect(cells).toEqual([{ row: 0, col: 1, symbol: 'p', promoted: false }])
  })

  it('reports each rank and its width', () => {
    const { cells, widths, rankCount } = readPosition('pp/1p/2')
    expect(rankCount).toBe(3)
    expect(widths).toEqual([2, 2, 2])
    expect(cells.filter(at(1, 1))).toHaveLength(1)
  })

  it('stops at the row limit', () => {
    expect(readPosition('p/p/p', { rows: 2 }).widths).toHaveLength(2)
  })
})
