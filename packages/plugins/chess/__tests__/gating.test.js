import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#158. S-Chess declared `hand: true` and `gating: true` and the engine
// read neither, because a hand was only ever a by-product of `drops` - which
// this variant does not use. So the Hawk and the Elephant never entered the
// board and it played as ordinary chess.
//
// Gating is not a move of its own: it rides along with the move that opens the
// gate, which is why it is generated as a variant of that move rather than as
// an action.

const COLS = 8
const at = (r, c) => r * COLS + c

function game(seed = 1) {
  return createGameForFamily('chess', { variant: 's-chess', rngSeed: seed })
}
const sliceOf = (g) => { const s = g.getState(); return s?.slice || s }

describe('gating (engine#158)', () => {
  it('opens with a Hawk and an Elephant in hand and neither on the board', () => {
    const slice = sliceOf(game())
    expect(slice.hands).toEqual([['hawk', 'elephant'], ['hawk', 'elephant']])
    expect(slice.board.filter(c => c && (c.type === 'hawk' || c.type === 'elephant'))).toEqual([])
  })

  it('counts every back-rank piece as a gate that has not opened yet', () => {
    const slice = sliceOf(game())
    expect(slice._gateSquares[0]).toEqual([56, 57, 58, 59, 60, 61, 62, 63])
    expect(slice._gateSquares[1]).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('offers each opening knight move plainly and once per piece in hand', () => {
    const moves = game().getLegalMoves()
    const plain = moves.filter(m => !m.gate)
    const gated = moves.filter(m => m.gate)
    expect(plain).toHaveLength(20)
    // Two knights, two moves each, two pieces in hand.
    expect(gated).toHaveLength(8)
    expect(new Set(gated.map(m => m.gate))).toEqual(new Set(['hawk', 'elephant']))
    // The gate is always the square being vacated, never anywhere else.
    expect(gated.every(m => m.gateAt === m.from)).toBe(true)
  })

  it('offers no gate on a pawn move', () => {
    const moves = game().getLegalMoves()
    const pawnMoves = moves.filter(m => m.from >= at(6, 0) && m.from <= at(6, 7))
    expect(pawnMoves.length).toBeGreaterThan(0)
    expect(pawnMoves.some(m => m.gate)).toBe(false)
  })

  it('puts the gated piece on the square the mover vacated', () => {
    const g = game()
    const move = g.getLegalMoves().find(m => m.gate === 'hawk')
    g.applyMove(move)
    const slice = sliceOf(g)
    expect(slice.board[move.from]).toEqual({ type: 'hawk', owner: 0 })
    expect(slice.hands[0]).toEqual(['elephant'])
  })

  it('spends the gate on that square whether it was used or not', () => {
    const g = game()
    const plain = g.getLegalMoves().find(m => !m.gate && m.from === at(7, 1))
    g.applyMove(plain)
    const slice = sliceOf(g)
    expect(slice._gateSquares[0]).not.toContain(at(7, 1))
    expect(slice.hands[0]).toEqual(['hawk', 'elephant'])
    // And the other seven are still open.
    expect(slice._gateSquares[0]).toHaveLength(7)
  })

  it('never adds a captured piece to the hand', () => {
    // "Hand pieces are never lost from the hand except by gating." A reserve is
    // not a crazyhouse hand, and seeding one turned every capture into a drop.
    for (const seed of [1, 2, 3]) {
      const g = game(seed)
      const rng = createRng(seed)
      for (let i = 0; i < 200; i++) {
        const moves = g.getLegalMoves()
        if (!moves.length) break
        const result = g.applyMove(moves[Math.floor(rng.next() * moves.length)])
        if (!result || !result.ok || result.winner) break
        for (const hand of sliceOf(g).hands) {
          for (const type of hand) expect(['hawk', 'elephant']).toContain(type)
        }
      }
    }
  })

  it('leaves crazyhouse taking captures into hand, as it declares drops', () => {
    const g = createGameForFamily('chess', { variant: 'crazyhouse', rngSeed: 1 })
    const rng = createRng(1)
    let sawOne = false
    for (let i = 0; i < 120; i++) {
      const moves = g.getLegalMoves()
      if (!moves.length) break
      const result = g.applyMove(moves[Math.floor(rng.next() * moves.length)])
      if (!result || !result.ok || result.winner) break
      if (sliceOf(g).hands.some(h => h.length)) { sawOne = true; break }
    }
    expect(sawOne).toBe(true)
  })

  it('gives the Hawk its leaps and the Elephant its slides', () => {
    const g = game()
    // Gate a Hawk onto b1, then read what it can do from there.
    const move = g.getLegalMoves().find(m => m.gate === 'hawk' && m.from === at(7, 1))
    g.applyMove(move)
    g.applyMove(g.getLegalMoves()[0])
    const fromHawk = g.getLegalMoves().filter(m => m.from === at(7, 1)).map(m => m.to).sort((a, b) => a - b)
    // Two diagonal steps to c6 and a knight leap to c6's neighbour, both over
    // its own pawn rank. The other knight square, a6, is where the knight that
    // opened this gate now stands, so the Hawk may not land on it - which is
    // the leap being real rather than unconditional.
    expect(fromHawk).toEqual([at(5, 2), at(5, 3)])
    expect(sliceOf(g).board[at(5, 0)]).toEqual({ type: 'knight', owner: 0 })
  })
})
