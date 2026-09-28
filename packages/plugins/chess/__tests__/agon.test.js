import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, getPlugin } from '../../../play/src/play.js'

// engine#157. Agon on the hex topology, played by the chess plugin its
// rulebook names: steps sideways or inward, custodial capture, the owner
// putting a captured piece back, and a win with the queen on the throne
// ringed by her guards. Cells are axial "q,r"; the throne is "0,0".

const WHITE = 0
const BLACK = 1
const ring = (key) => {
  const [q, r] = key.split(',').map(Number)
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r))
}

function position(pieces, toMove = WHITE, hands = [[], []]) {
  const g = createGameForFamily('agon', { variant: 'standard', rngSeed: 1 })
  const slice = g.getState().slice
  const board = Object.fromEntries(Object.keys(slice.board).map(k => [k, null]))
  for (const [cell, type, owner] of pieces) board[cell] = { type, owner }
  g.loadState({ slice: { ...slice, board, hands }, players: { currentIndex: toMove } })
  return g
}

const targetsFrom = (g, cell) => g.getLegalMoves().filter(m => m.from === cell).map(m => m.to).sort()

describe('Agon plays through the chess plugin (engine#157)', () => {
  it('is handed to the plugin its rulebook names', () => {
    expect(getPlugin('agon')?.factory).toBe(getPlugin('chess').factory)
  })

  it('opens with every piece on the outer ring, stepping sideways or inward onto a vacant hex', () => {
    const g = createGameForFamily('agon', { variant: 'standard', rngSeed: 1 })
    const board = g.getState().slice.board
    const moves = g.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(ring(m.to)).toBeLessThanOrEqual(ring(m.from))
      expect(board[m.to] ?? null).toBeNull()
    }
  })
})

describe('movement', () => {
  it('never steps outward', () => {
    const g = position([['2,0', 'guard', WHITE], ['-5,5', 'queen', BLACK]])
    const targets = targetsFrom(g, '2,0')
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every(t => ring(t) <= 2)).toBe(true)
    expect(targets).not.toContain('3,0')
  })

  it('lets the queen onto the throne and no guard', () => {
    const queen = position([['1,0', 'queen', WHITE], ['-5,5', 'queen', BLACK]])
    expect(targetsFrom(queen, '1,0')).toContain('0,0')
    const guard = position([['1,0', 'guard', WHITE], ['-5,5', 'queen', BLACK]])
    expect(targetsFrom(guard, '1,0')).not.toContain('0,0')
  })

  it('never moves onto another piece', () => {
    const g = position([['2,0', 'guard', WHITE], ['1,0', 'guard', BLACK], ['-5,5', 'queen', BLACK]])
    expect(targetsFrom(g, '2,0')).not.toContain('1,0')
  })
})

describe('custodial capture', () => {
  it('takes a piece the move leaves between two of the mover', () => {
    const g = position([['1,2', 'guard', WHITE], ['3,1', 'guard', WHITE], ['2,1', 'guard', BLACK], ['-5,5', 'queen', BLACK]])
    g.applyMove({ from: '1,2', to: '1,1' })
    const slice = g.getState().slice
    expect(slice.board['2,1']).toBeNull()
    expect(slice.hands[BLACK]).toEqual(['guard'])
  })

  it('does not take a piece that steps between two enemies', () => {
    const g = position([['1,1', 'guard', WHITE], ['3,1', 'guard', WHITE], ['2,2', 'guard', BLACK], ['-5,5', 'queen', WHITE]], BLACK)
    g.applyMove({ from: '2,2', to: '2,1' })
    expect(g.getState().slice.board['2,1']).toEqual({ type: 'guard', owner: BLACK })
  })
})

describe('returning a captured piece', () => {
  it('makes the owner put a guard back on the outer ring before anything else', () => {
    const g = position([['2,0', 'guard', BLACK], ['-5,5', 'queen', BLACK], ['3,0', 'guard', WHITE]], BLACK, [[], ['guard']])
    const moves = g.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.action === 'drop' && m.type === 'guard' && ring(m.to) === 5)).toBe(true)
  })

  it('returns the queen first, and anywhere', () => {
    const g = position([['2,0', 'guard', BLACK], ['3,0', 'guard', WHITE]], BLACK, [[], ['guard', 'queen']])
    const moves = g.getLegalMoves()
    expect(moves.every(m => m.action === 'drop' && m.type === 'queen')).toBe(true)
    expect(moves.some(m => ring(m.to) < 5)).toBe(true)
  })
})

describe('winning', () => {
  it('is won when the last guard closes the ring round the queen on the throne', () => {
    const around = ['1,0', '1,-1', '0,-1', '-1,0', '-1,1']
    const g = position([
      ['0,0', 'queen', WHITE],
      ...around.map(c => [c, 'guard', WHITE]),
      ['0,2', 'guard', WHITE],
      ['-5,5', 'queen', BLACK],
    ])
    expect(g.checkWin()).toBeNull()
    g.applyMove({ from: '0,2', to: '0,1' })
    expect(g.checkWin()).toBe(WHITE)
  })

  it('is not won with the ring closed but the queen elsewhere', () => {
    const around = ['1,0', '1,-1', '0,-1', '-1,0', '-1,1']
    const g = position([
      ['2,-1', 'queen', WHITE],
      ...around.map(c => [c, 'guard', WHITE]),
      ['0,2', 'guard', WHITE],
      ['-5,5', 'queen', BLACK],
    ])
    g.applyMove({ from: '0,2', to: '0,1' })
    expect(g.checkWin()).toBeNull()
  })
})
