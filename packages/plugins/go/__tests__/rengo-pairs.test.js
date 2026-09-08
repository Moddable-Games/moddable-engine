import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#162. Pair play: four seats, two sides, partners alternating.
//
// This looked like it needed a team model and did not. A stone on a Go board is
// stored as its colour, not as whose turn placed it, so a side already existed -
// the only thing assuming otherwise was the opponent lookup, which read "the
// other seat's colour". With four seats that is wrong twice: `1 - index` runs
// off the end of the list, and the seat opposite you is your partner half the
// time. Asking which colour is not mine fixes both.

const game = () => createGameForFamily('go', { variant: 'rengo' })
const placements = (g) => g.getLegalMoves().filter(m => m.coord !== undefined && m.coord !== null)

describe('Rengo seats four players on two sides (engine#162)', () => {
  it('rotates through all four seats, partners alternating', () => {
    const g = game()
    const order = [g.currentPlayer()]
    for (let i = 0; i < 4; i += 1) {
      g.applyMove(placements(g)[i * 7])
      order.push(g.currentPlayer())
    }
    expect(order).toEqual(['black1', 'white1', 'black2', 'white2', 'black1'])
  })

  it('gives the partners one colour between them, not one each', () => {
    const g = game()
    for (let i = 0; i < 4; i += 1) g.applyMove(placements(g)[i * 7])
    const stones = g.getState().slice.board.filter(Boolean)
    expect(stones).toEqual(['black', 'white', 'black', 'white'])
    // Four seats have played and there are two sides on the board.
    expect(new Set(stones).size).toBe(2)
  })

  it('lets a partner capture with a stone the other partner placed', () => {
    // Black surrounds a white stone across two Black turns; the capture is made
    // by the partner who did not start it.
    const g = game()
    const SIZE = 19
    const at = (r, c) => r * SIZE + c
    const play = (coord) => {
      const move = g.getLegalMoves().find(m => m.coord === coord)
      expect(move).toBeDefined()
      g.applyMove(move)
    }
    play(at(5, 5))            // black1
    play(at(5, 6))            // white1  - the stone to be taken
    play(at(4, 6))            // black2
    play(at(0, 0))            // white2  - elsewhere
    play(at(6, 6))            // black1
    play(at(0, 1))            // white1
    play(at(5, 7))            // black2 closes the fourth liberty
    expect(g.getState().slice.board[at(5, 6)]).toBeFalsy()
  })

  it('still ends and scores with four seats at the table', () => {
    const g = game()
    g.applyMove(placements(g)[100])
    for (let i = 0; i < 4; i += 1) {
      const pass = g.getLegalMoves().find(m => m.action === 'pass')
      expect(pass).toBeDefined()
      g.applyMove(pass)
    }
    const outcome = g.checkWin()
    expect(outcome === null || outcome === undefined).toBe(false)
  })
})
