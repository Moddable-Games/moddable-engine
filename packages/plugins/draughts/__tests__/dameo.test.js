import { createDraughtsPlugin } from '../index.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#161. Dameo inverts the family: men move diagonally forward and capture
// orthogonally, kings move queenwise and capture rookwise. Its own entry called
// that "the most commonly mis-implemented part of the game", and the direction
// axes Frisian needed cover all of it. What is new is the phalanx.

const COLS = 8
const at = (r, c) => r * COLS + c
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const DAMEO = {
  rows: 8, cols: 8, piecesPerPlayer: 18,
  directions: 'all', captureDirections: 'orthogonal', manCapture: 'all',
  flyingKings: true, forcedCapture: true, maximalCapture: true,
  removeImmediately: false, phalanx: true,
}

function position(cells) {
  const plugin = createDraughtsPlugin(DAMEO)
  const slice = plugin.init({}, { request: () => null })
  slice.board = new Array(64).fill(null)
  for (const [index, piece] of Object.entries(cells)) slice.board[index] = piece
  return { plugin, slice }
}

const man = (owner = 0) => ({ type: 'man', owner })
const king = (owner = 0) => ({ type: 'king', owner })
const movesFor = (plugin, slice, seat = 0) => plugin.getLegalMoves(slice, turn(seat))

describe('dameo (engine#161)', () => {
  describe('the phalanx', () => {
    it('slides a line forward by moving its rearmost man beyond the head', () => {
      // Three men up the e-file. Seat 0 moves up the board, so the rear is the
      // lowest row number... the rear is the one furthest back, at row 6.
      const { plugin, slice } = position({
        [at(6, 4)]: man(0), [at(5, 4)]: man(0), [at(4, 4)]: man(0),
      })
      const phalanx = movesFor(plugin, slice).filter(m => m.phalanx)
      expect(phalanx).toHaveLength(1)
      expect(phalanx[0].from).toBe(at(6, 4))
      expect(phalanx[0].to).toBe(at(3, 4))

      const after = plugin.applyMove(phalanx[0], slice, turn(0))
      expect(after.board[at(6, 4)]).toBe(null)
      expect(after.board[at(3, 4)]).toEqual(man(0))
      // The middle of the line does not move.
      expect(after.board[at(5, 4)]).toEqual(man(0))
      expect(after.board[at(4, 4)]).toEqual(man(0))
    })

    it('offers a line once, from its rear, not once per man in it', () => {
      const { plugin, slice } = position({
        [at(6, 4)]: man(0), [at(5, 4)]: man(0), [at(4, 4)]: man(0), [at(3, 4)]: man(0),
      })
      const phalanx = movesFor(plugin, slice).filter(m => m.phalanx)
      expect(phalanx.map(m => m.from)).toEqual([at(6, 4)])
    })

    it('needs the square beyond the head to be empty', () => {
      const { plugin, slice } = position({
        [at(6, 4)]: man(0), [at(5, 4)]: man(0), [at(4, 4)]: man(1),
      })
      expect(movesFor(plugin, slice).filter(m => m.phalanx)).toHaveLength(0)
    })

    it('offers nothing for a single man, which moves ordinarily', () => {
      const { plugin, slice } = position({ [at(6, 4)]: man(0) })
      const moves = movesFor(plugin, slice)
      expect(moves.filter(m => m.phalanx)).toHaveLength(0)
      expect(moves.length).toBeGreaterThan(0)
    })

    it('slides a diagonal line, and not a line lying across the board', () => {
      const diagonal = position({ [at(6, 2)]: man(0), [at(5, 3)]: man(0) })
      expect(movesFor(diagonal.plugin, diagonal.slice).filter(m => m.phalanx)).toHaveLength(1)

      // A rank has no forward along itself. Each of these two men still has its
      // own ordinary moves, but neither starts a phalanx.
      const across = position({ [at(6, 2)]: man(0), [at(6, 3)]: man(0) })
      expect(movesFor(across.plugin, across.slice).filter(m => m.phalanx)).toHaveLength(0)
    })
  })

  describe('the inversion', () => {
    it('moves a man forward and diagonally forward, never sideways or back', () => {
      const { plugin, slice } = position({ [at(4, 4)]: man(0) })
      const targets = movesFor(plugin, slice).map(m => m.to).sort((a, b) => a - b)
      expect(targets).toEqual([at(3, 3), at(3, 4), at(3, 5)].sort((a, b) => a - b))
    })

    it('captures orthogonally and not diagonally', () => {
      const orthogonal = position({ [at(4, 4)]: man(0), [at(3, 4)]: man(1) })
      const up = movesFor(orthogonal.plugin, orthogonal.slice)
      expect(up.some(m => m.to === at(2, 4) && m.captures?.length)).toBe(true)

      const diagonal = position({ [at(4, 4)]: man(0), [at(3, 3)]: man(1) })
      const across = movesFor(diagonal.plugin, diagonal.slice)
      expect(across.some(m => m.captures?.length)).toBe(false)
    })

    it('captures sideways and backwards too, which its movement never does', () => {
      const sideways = position({ [at(4, 4)]: man(0), [at(4, 5)]: man(1) })
      expect(movesFor(sideways.plugin, sideways.slice).some(m => m.to === at(4, 6))).toBe(true)

      const backwards = position({ [at(4, 4)]: man(0), [at(5, 4)]: man(1) })
      expect(movesFor(backwards.plugin, backwards.slice).some(m => m.to === at(6, 4))).toBe(true)
    })

    it('moves a king queenwise', () => {
      const { plugin, slice } = position({ [at(4, 4)]: king(0) })
      const targets = movesFor(plugin, slice).map(m => m.to)
      expect(targets).toContain(at(0, 0))
      expect(targets).toContain(at(4, 0))
      expect(targets).toContain(at(7, 4))
    })
  })

  it('opens on all 64 squares with thirty-six men', () => {
    const state = createGameForFamily('draughts', { variant: 'dameo', rngSeed: 1 }).getState()
    const slice = state?.slice || state
    expect(slice.board.filter(Boolean)).toHaveLength(36)
    // Seat 0 is white, on the near rank, and moves up the board.
    expect(slice.board[at(7, 0)]).toEqual(man(0))
    expect(slice.board[at(0, 0)]).toEqual(man(1))
  })

  it('reaches a terminal position from every seed', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGameForFamily('draughts', { variant: 'dameo', rngSeed: seed })
      const rng = createRng(seed)
      let outcome = 'timeout'
      for (let i = 0; i < 600; i++) {
        const moves = game.getLegalMoves()
        if (!moves.length) { outcome = 'no-moves'; break }
        const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
        if (!result || !result.ok) { outcome = 'rejected'; break }
        if (result.winner !== undefined && result.winner !== null) { outcome = `winner:${result.winner}`; break }
      }
      expect(outcome).not.toBe('timeout')
      expect(outcome).not.toBe('rejected')
    }
  })
})
