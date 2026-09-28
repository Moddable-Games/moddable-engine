import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, getPlugin } from '../../../play/src/play.js'

// engine#154. Tafl is played by the chess plugin, named in its rulebook. The
// two seats are not mirror images: the attackers have no king and win by
// taking the defenders'; the defenders win when their king escapes. Every
// piece moves as a rook and captures by enclosing.

const ATT = 0
const DEF = 1

function position(variant, n, pieces, toMove = ATT) {
  const g = createGameForFamily('tafl', { variant, rngSeed: 1 })
  const slice = g.getState().slice
  const board = slice.board.map(() => null)
  for (const [[r, c], type, owner] of pieces) board[r * n + c] = { type, owner }
  g.loadState({ slice: { ...slice, board }, players: { currentIndex: toMove } })
  return g
}

const at = (n) => ([r, c]) => r * n + c
const cellOf = (g, n, rc) => g.getState().slice.board[at(n)(rc)]

describe('Tafl plays through the chess plugin (engine#154)', () => {
  it('is handed to the plugin its rulebook names', () => {
    expect(getPlugin('tafl')?.factory).toBe(getPlugin('chess').factory)
  })

  it('opens with the attackers to move, every move a rook move onto an empty square', () => {
    const g = createGameForFamily('tafl', { variant: 'standard', rngSeed: 1 })
    const board = g.getState().slice.board
    const moves = g.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      expect(board[m.from].owner).toBe(ATT)
      expect(board[m.to]).toBeNull()
      const same = Math.floor(m.from / 9) === Math.floor(m.to / 9) || m.from % 9 === m.to % 9
      expect(same).toBe(true)
    }
  })
})

describe('capture by enclosing', () => {
  const T = at(9)

  it('takes a piece closed between two enemies by the move that closes it', () => {
    const g = position('standard', 9, [[[2, 2], 'defender', DEF], [[2, 1], 'attacker', ATT], [[0, 3], 'attacker', ATT], [[8, 8], 'king', DEF]])
    g.applyMove({ from: T([0, 3]), to: T([2, 3]) })
    expect(cellOf(g, 9, [2, 2])).toBeNull()
  })

  it('does not take a piece that steps between two enemies', () => {
    const g = position('standard', 9, [[[2, 1], 'attacker', ATT], [[2, 3], 'attacker', ATT], [[0, 2], 'defender', DEF], [[8, 8], 'king', DEF]], DEF)
    g.applyMove({ from: T([0, 2]), to: T([2, 2]) })
    expect(cellOf(g, 9, [2, 2])).toEqual({ type: 'defender', owner: DEF })
  })

  it('counts the empty throne as an enemy', () => {
    // A defender beside the empty throne falls to one attacker on its far side.
    const g = position('standard', 9, [[[4, 5], 'defender', DEF], [[0, 6], 'attacker', ATT], [[8, 0], 'king', DEF]])
    g.applyMove({ from: T([0, 6]), to: T([4, 6]) })
    expect(cellOf(g, 9, [4, 5])).toBeNull()
  })

  it("takes Tablut's king only with every side closed, the empty throne counting as one", () => {
    const two = position('standard', 9, [[[2, 2], 'king', DEF], [[2, 1], 'attacker', ATT], [[0, 3], 'attacker', ATT]])
    two.applyMove({ from: T([0, 3]), to: T([2, 3]) })
    expect(cellOf(two, 9, [2, 2])?.type).toBe('king')
    const four = position('standard', 9, [[[2, 2], 'king', DEF], [[2, 1], 'attacker', ATT], [[2, 3], 'attacker', ATT], [[1, 2], 'attacker', ATT], [[3, 0], 'attacker', ATT]])
    four.applyMove({ from: T([3, 0]), to: T([3, 2]) })
    expect(cellOf(four, 9, [2, 2])).toBeNull()
    expect(four.checkWin()).toBe(ATT)
    const throne = position('standard', 9, [[[4, 5], 'king', DEF], [[3, 5], 'attacker', ATT], [[5, 5], 'attacker', ATT], [[0, 6], 'attacker', ATT]])
    throne.applyMove({ from: T([0, 6]), to: T([4, 6]) })
    expect(throne.checkWin()).toBe(ATT)
  })

  it("takes Brandubh's king like any piece away from the centre", () => {
    const B = at(7)
    const g = position('brandubh', 7, [[[1, 1], 'king', DEF], [[1, 0], 'attacker', ATT], [[0, 2], 'attacker', ATT]])
    g.applyMove({ from: B([0, 2]), to: B([1, 2]) })
    expect(g.checkWin()).toBe(ATT)
  })

  it('takes two in a line at once in Tawlbwrdd, and not four', () => {
    const W = at(11)
    const pair = position('tawlbwrdd', 11, [[[2, 2], 'defender', DEF], [[2, 3], 'defender', DEF], [[2, 1], 'attacker', ATT], [[0, 4], 'attacker', ATT], [[10, 10], 'king', DEF]])
    pair.applyMove({ from: W([0, 4]), to: W([2, 4]) })
    expect(cellOf(pair, 11, [2, 2])).toBeNull()
    expect(cellOf(pair, 11, [2, 3])).toBeNull()
    const row = position('tawlbwrdd', 11, [[[2, 2], 'defender', DEF], [[2, 3], 'defender', DEF], [[2, 4], 'defender', DEF], [[2, 5], 'defender', DEF], [[2, 1], 'attacker', ATT], [[0, 6], 'attacker', ATT], [[10, 10], 'king', DEF]])
    row.applyMove({ from: W([0, 6]), to: W([2, 6]) })
    expect(cellOf(row, 11, [2, 2])).not.toBeNull()
  })
})

describe('squares only the king may use, and the escape', () => {
  it("keeps everyone but the king off Hnefatafl's corners, and lets the king win there", () => {
    const H = at(11)
    const g = position('hnefatafl', 11, [[[0, 3], 'attacker', ATT], [[3, 0], 'king', DEF]])
    expect(g.getLegalMoves().some(m => m.to === H([0, 0]))).toBe(false)
    const king = position('hnefatafl', 11, [[[0, 3], 'attacker', ATT], [[3, 0], 'king', DEF]], DEF)
    expect(king.getLegalMoves().some(m => m.to === H([0, 0]))).toBe(true)
    king.applyMove({ from: H([3, 0]), to: H([0, 0]) })
    expect(king.checkWin()).toBe(DEF)
  })

  it('does not end Hnefatafl on an edge square that is not a corner', () => {
    const H = at(11)
    const g = position('hnefatafl', 11, [[[10, 10], 'attacker', ATT], [[3, 3], 'king', DEF]], DEF)
    g.applyMove({ from: H([3, 3]), to: H([3, 0]) })
    expect(g.checkWin()).toBe(null)
  })

  it('ends Tablut on any edge square', () => {
    const T = at(9)
    const g = position('standard', 9, [[[8, 8], 'attacker', ATT], [[3, 3], 'king', DEF]], DEF)
    g.applyMove({ from: T([3, 3]), to: T([3, 0]) })
    expect(g.checkWin()).toBe(DEF)
  })

  it('bars the vacated throne, even to the king', () => {
    const T = at(9)
    const g = position('standard', 9, [[[8, 8], 'attacker', ATT], [[4, 2], 'king', DEF]], DEF)
    expect(g.getLegalMoves().some(m => m.to === T([4, 4]))).toBe(false)
  })
})
