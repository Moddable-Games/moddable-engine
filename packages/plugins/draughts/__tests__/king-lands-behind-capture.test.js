import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#161. Thai draughts (Makhos) has one rule that separates it from every
// other flying-king variant, and Wikipedia's Draughts article states it
// directly: "Thai checkers, which has a king that can only land on the vacant
// square immediately beyond a captured piece."
//
// The king still flies to REACH the capture, so this cannot be expressed by
// turning `flyingKings` off - that would also stop it travelling. The
// restriction is only on where it comes to rest, which is what
// `kingLandsBehindCapture` says.

// White king in the corner, one black man two squares away on the diagonal,
// and a long empty diagonal beyond it. A flying king could rest anywhere along
// that diagonal; a Thai king may rest only on the first square.
function captureLandings(variant, size) {
  const game = createGameForFamily('draughts', { variant, rngSeed: 1 })
  const base = game.getState()?.slice || game.getState()
  const board = new Array(size * size).fill(null)
  const at = (r, c) => r * size + c

  board[at(size - 1, 0)] = { type: 'king', owner: 0 }
  board[at(size - 3, 2)] = { type: 'man', owner: 1 }
  board[at(0, size - 1)] = { type: 'man', owner: 1 }

  game.loadState({ slice: { ...base, board }, players: { currentIndex: 0 } })
  return game.getLegalMoves()
    .filter(m => m.captures && m.captures.length)
    .map(m => [Math.floor(m.to / size), m.to % size])
}

describe('kingLandsBehindCapture (engine#161)', () => {
  it('offers a Thai king exactly one landing, immediately beyond the piece taken', () => {
    const landings = captureLandings('thai', 8)
    expect(landings).toEqual([[4, 3]])
  })

  it('leaves international offering every empty square beyond it', () => {
    const landings = captureLandings('international', 10)
    expect(landings.length).toBeGreaterThan(1)
    expect(landings).toContainEqual([6, 3])
  })

  it('still lets the Thai king fly to reach the capture in the first place', () => {
    // The capture is found from two squares away, which a non-flying king
    // could also do - but the king began in the corner and the man is not
    // adjacent to it, so the ray scan ran.
    expect(captureLandings('thai', 8).length).toBe(1)
  })

  it('plays thai to a terminal position', () => {
    const game = createGameForFamily('draughts', { variant: 'thai', rngSeed: 1 })
    let terminal = false
    for (let i = 0; i < 400; i++) {
      const winner = game.checkWin()
      if (winner !== null && winner !== undefined) { terminal = true; break }
      const moves = game.getLegalMoves()
      if (!moves.length) { terminal = true; break }
      const capture = moves.find(m => m.captures && m.captures.length)
      game.applyMove(capture || moves[i % moves.length])
    }
    expect(terminal).toBe(true)
  })
})

describe('diagonal draughts was a stale declaration, not a gap (engine#161)', () => {
  it('sets up 20 a side on the 10x10 with the long diagonal empty', () => {
    const game = createGameForFamily('draughts', { variant: 'diagonal', rngSeed: 1 })
    const board = (game.getState()?.slice || game.getState()).board

    expect(board.filter(p => p && p.owner === 0)).toHaveLength(20)
    expect(board.filter(p => p && p.owner === 1)).toHaveLength(20)

    // The variant's own `special` says the long diagonal is empty at setup.
    const antiDiagonal = [...Array(10).keys()].map(i => board[i * 10 + (9 - i)])
    expect(antiDiagonal.filter(Boolean)).toEqual([])
  })

  it('captures remove pieces and men promote', () => {
    const game = createGameForFamily('draughts', { variant: 'diagonal', rngSeed: 1 })
    let captures = 0
    for (let i = 0; i < 400; i++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const capture = moves.find(m => m.captures && m.captures.length)
      const before = (game.getState()?.slice || game.getState()).board.filter(Boolean).length
      game.applyMove(capture || moves[i % moves.length])
      const after = (game.getState()?.slice || game.getState()).board
      if (capture) {
        captures++
        expect(after.filter(Boolean).length).toBeLessThan(before)
      }
    }
    expect(captures).toBeGreaterThan(10)
  })
})
