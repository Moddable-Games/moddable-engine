import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, getPlugin } from '../../../play/src/play.js'

// engine#157. Fanorona is played by the draughts plugin, named in its
// rulebook, with capture by approach and withdrawal and a chain that
// remembers where the piece has been. The board is 9 x 5 on intersections,
// with diagonals only through points whose coordinate sum is even.

const COLS = 9
const at = (sq) => (5 - Number(sq.slice(1))) * COLS + 'abcdefghi'.indexOf(sq[0])
const alg = (i) => 'abcdefghi'[i % COLS] + (5 - Math.floor(i / COLS))
const WHITE = 0
const BLACK = 1

function position(pieces, toMove = WHITE) {
  const g = createGameForFamily('fanorona', { variant: 'standard', rngSeed: 1 })
  const slice = g.getState().slice
  const board = slice.board.map(() => null)
  for (const [sq, owner] of pieces) board[at(sq)] = { type: 'man', owner }
  g.loadState({ slice: { ...slice, board }, players: { currentIndex: toMove } })
  return g
}

const describeMove = (m) => m.action || `${alg(m.from)}-${alg(m.to)} ${m.method || ''} ${(m.captures || []).map(alg).sort().join(',')}`.trim()
const movesOf = (g) => g.getLegalMoves().map(describeMove).sort()

describe('Fanorona plays through the draughts plugin (engine#157)', () => {
  it('is handed to the plugin its rulebook names', () => {
    expect(getPlugin('fanorona')?.factory).toBe(getPlugin('draughts').factory)
  })

  it('opens with the five captures the centre allows, and nothing else', () => {
    const g = createGameForFamily('fanorona', { variant: 'standard', rngSeed: 1 })
    expect(movesOf(g)).toEqual([
      'd2-e3 approach f4,g5',
      'd3-e3 approach f3',
      'd3-e3 withdrawal c3',
      'e2-e3 approach e4,e5',
      'f2-e3 approach c5,d4',
    ])
  })
})

describe('approach and withdrawal', () => {
  it('takes the whole unbroken line and stops at a gap or a friend', () => {
    const g = position([['a1', WHITE], ['c1', BLACK], ['d1', BLACK], ['f1', BLACK], ['i5', BLACK]])
    expect(movesOf(g)).toContain('a1-b1 approach c1,d1')
  })

  it('withdraws from a line behind it', () => {
    const g = position([['c1', WHITE], ['b1', BLACK], ['a1', BLACK], ['i5', BLACK]])
    expect(movesOf(g)).toContain('c1-d1 withdrawal a1,b1')
  })

  it('moves diagonally only from a point a diagonal passes through', () => {
    // b1 has an odd coordinate sum: no diagonal, so no diagonal capture.
    const weak = position([['b1', WHITE], ['d3', BLACK], ['i5', BLACK]])
    expect(movesOf(weak).filter(m => m.startsWith('b1-c2'))).toEqual([])
    const strong = position([['c1', WHITE], ['e3', BLACK], ['i5', BLACK]])
    expect(movesOf(strong)).toContain('c1-d2 approach e3')
  })

  it('offers a paika move only when there is nothing to capture', () => {
    const g = position([['a1', WHITE], ['i5', BLACK]])
    expect(movesOf(g)).toEqual(['a1-a2', 'a1-b1', 'a1-b2'])
    const forced = position([['a1', WHITE], ['e1', WHITE], ['g1', BLACK], ['i5', BLACK]])
    expect(movesOf(forced)).toEqual(['e1-f1 approach g1'])
  })
})

describe('the chain', () => {
  // White c3 steps to d3 taking e3 by approach, and from d3 may take again.
  function chainStart() {
    return position([['c3', WHITE], ['e3', BLACK], ['d5', BLACK], ['b3', BLACK], ['i5', BLACK], ['a1', WHITE]])
  }

  it('continues with the same piece and offers to stop', () => {
    const g = chainStart()
    g.applyMove({ from: at('c3'), to: at('d3'), method: 'approach', captures: [at('e3')] })
    expect(g.currentPlayer()).toBe('white')
    const next = movesOf(g)
    expect(next).toContain('stop')
    expect(next).toContain('d3-d4 approach d5')
    expect(next.every(m => m === 'stop' || m.startsWith('d3-'))).toBe(true)
  })

  it('may not go on in the direction it just travelled', () => {
    // Withdrawing east from b3 leaves d3-e3 approaching f3: a capture, in the
    // same direction, so the chain ends there.
    const g = position([['c3', WHITE], ['b3', BLACK], ['f3', BLACK], ['i5', BLACK]])
    g.applyMove({ from: at('c3'), to: at('d3'), method: 'withdrawal', captures: [at('b3')] })
    expect(g.currentPlayer()).toBe('black')
  })

  it('may not land where it has already been this turn', () => {
    // After withdrawing from b3, d3-c3 would withdraw from e3, but c3 is where
    // the piece started.
    const g = position([['c3', WHITE], ['b3', BLACK], ['e3', BLACK], ['i5', BLACK]])
    g.applyMove({ from: at('c3'), to: at('d3'), method: 'withdrawal', captures: [at('b3')] })
    expect(g.currentPlayer()).toBe('black')
  })

  it('offers both of those captures when they are not a continuation', () => {
    expect(movesOf(position([['d3', WHITE], ['f3', BLACK], ['i5', BLACK]]))).toContain('d3-e3 approach f3')
    expect(movesOf(position([['d3', WHITE], ['e3', BLACK], ['i5', BLACK]]))).toContain('d3-c3 withdrawal e3')
  })

  it('hands the turn over when the player stops', () => {
    const g = chainStart()
    g.applyMove({ from: at('c3'), to: at('d3'), method: 'approach', captures: [at('e3')] })
    g.applyMove({ action: 'stop' })
    expect(g.currentPlayer()).toBe('black')
    expect(g.getState().slice._chainActive).toBe(false)
  })

  it('ends by itself when nothing more can be taken', () => {
    const g = position([['c3', WHITE], ['e3', BLACK], ['i5', BLACK]])
    g.applyMove({ from: at('c3'), to: at('d3'), method: 'approach', captures: [at('e3')] })
    expect(g.currentPlayer()).toBe('black')
  })
})

describe('winning', () => {
  it('is won by taking every enemy piece', () => {
    const g = position([['c3', WHITE], ['e3', BLACK]])
    g.applyMove({ from: at('c3'), to: at('d3'), method: 'approach', captures: [at('e3')] })
    expect(g.checkWin()).toBe(WHITE)
  })
})
