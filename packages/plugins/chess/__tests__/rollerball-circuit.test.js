import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#170. "When the King reaches the starting square of the opposite King,
// but only if had turned clockwise." White's King starts on d2, Black's on d6,
// so each side's goal is the other's starting square.
//
// The clause the source does not define is "had turned clockwise". Read here as
// net travel about the centre of the board: going the long way round counts,
// doubling back the short way does not.

const COLS = 7
const at = (file, rank) => (7 - rank) * COLS + 'abcdefg'.indexOf(file)

const game = () => createGameForFamily('chess', { variant: 'rollerball' })

function only(g, placements) {
  const slice = g.getState().slice
  const source = slice.board.slice()
  slice.board = slice.board.map(() => null)
  for (const [square, type, owner] of placements) {
    const template = source.find(p => p && p.type === type && p.owner === owner)
    slice.board[at(square[0], Number(square[1]))] = template ? { ...template } : { type, owner }
  }
  return slice
}

// Walk the White King along a path, one step per move, letting Black shuffle.
function walk(g, path) {
  for (const square of path) {
    const target = at(square[0], Number(square[1]))
    const move = g.getLegalMoves().find(m => m.to === target)
    if (!move) throw new Error(`no move to ${square}`)
    g.applyMove(move)
    // Seat 0 is a winner and also falsy, so this asks whether there IS a result
    // rather than whether the result is truthy.
    const outcome = g.checkWin()
    if (outcome !== null && outcome !== undefined) return outcome
    const reply = g.getLegalMoves()[0]
    if (!reply) return null
    g.applyMove(reply)
  }
  const final = g.checkWin()
  return final === undefined ? null : final
}

describe('Rollerball: winning by completing the circuit (engine#170)', () => {
  it('does not end the game while the King is anywhere else', () => {
    const g = game()
    only(g, [['d2', 'king', 0], ['d6', 'king', 1], ['a4', 'rook', 1]])
    expect(g.checkWin()).toBeFalsy()
  })

  it('wins when the King reaches d6 having gone the long way round', () => {
    const g = game()
    only(g, [['d2', 'king', 0], ['g4', 'king', 1]])
    // Clockwise from the south zone is westward, then up the west side, then
    // east along the top: d2 -> c2 -> b2 -> a3 -> a4 -> a5 -> b6 -> c6 -> d6.
    const result = walk(g, ['c2', 'b2', 'a3', 'a4', 'a5', 'b6', 'c6', 'd6'])
    expect(result).toBe(0)
  })

  it('does not win by taking the short way round anticlockwise', () => {
    const g = game()
    // Kings only. A Black rook anywhere on the ring covers most of a rank or
    // file, and with check now enforced it would make the King's path illegal
    // rather than merely unrewarding - which is a different thing from the one
    // being tested.
    only(g, [['d2', 'king', 0], ['a4', 'king', 1]])
    // Anticlockwise: d2 -> e2 -> f2 -> g3 -> g4 -> g5 -> f6 -> e6 -> d6.
    const result = walk(g, ['e2', 'f2', 'g3', 'g4', 'g5', 'f6', 'e6', 'd6'])
    expect(result).toBeNull()
  })
})
