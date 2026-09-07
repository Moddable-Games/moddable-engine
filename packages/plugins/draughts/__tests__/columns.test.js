import { createDraughtsPlugin } from '../index.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#161. Bashni and Lasca take nothing off the board. A captured piece is
// imprisoned beneath the piece that took it and can be freed again if the
// jailer is itself captured, so material is never destroyed - only buried.
//
// A square therefore holds an ordered column rather than a piece. The
// representation keeps the top piece where a piece has always been and hangs
// the rest off it in `under`, so everything that reads ownership, move type or
// promotion still reads the top and needs no change at all.

const COLS = 8
const at = (r, c) => r * COLS + c
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const BASHNI = {
  rows: 8, cols: 8, piecesPerPlayer: 12, columns: true,
  directions: 'diagonal', manCapture: 'all', flyingKings: true,
  forcedCapture: true, removeImmediately: false,
}

function position(cells) {
  const plugin = createDraughtsPlugin(BASHNI)
  const slice = plugin.init({}, { request: () => null })
  slice.board = new Array(64).fill(null)
  for (const [index, piece] of Object.entries(cells)) slice.board[index] = piece
  return { plugin, slice }
}

const man = (owner = 0, under) => (under ? { type: 'man', owner, under } : { type: 'man', owner })
const king = (owner = 0, under) => (under ? { type: 'king', owner, under } : { type: 'king', owner })

// Everything on the board, buried or not.
const pieceCount = (board) =>
  board.reduce((n, cell) => n + (cell ? 1 + (cell.under?.length || 0) : 0), 0)

const capture = (plugin, slice, seat = 0) =>
  plugin.getLegalMoves(slice, turn(seat)).find(m => m.captures?.length)

describe('columns: bashni and lasca (engine#161)', () => {
  it('puts the captured piece at the bottom of the column that took it', () => {
    const { plugin, slice } = position({ [at(4, 4)]: man(0), [at(3, 5)]: man(1) })
    const move = capture(plugin, slice)
    expect(move).toBeDefined()
    const after = plugin.applyMove(move, slice, turn(0))

    expect(after.board[at(3, 5)]).toBe(null)
    const column = after.board[move.to]
    expect(column.owner).toBe(0)
    expect(column.under).toEqual([{ type: 'man', owner: 1 }])
    expect(pieceCount(after.board)).toBe(pieceCount(slice.board))
  })

  it('takes only the top of a captured column and uncovers the rest', () => {
    // The victim is a black man standing on a white man. Taking it hands the
    // square back to white.
    const { plugin, slice } = position({
      [at(4, 4)]: man(0),
      [at(3, 5)]: man(1, [{ type: 'man', owner: 0 }]),
    })
    const after = plugin.applyMove(capture(plugin, slice), slice, turn(0))

    expect(after.board[at(3, 5)]).toEqual({ type: 'man', owner: 0, under: [] })
    expect(after.board[at(2, 6)].under).toEqual([{ type: 'man', owner: 1 }])
    expect(pieceCount(after.board)).toBe(pieceCount(slice.board))
  })

  it('carries the pieces beneath it when the column moves', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: man(0, [{ type: 'man', owner: 1 }, { type: 'king', owner: 1 }]),
    })
    const move = plugin.getLegalMoves(slice, turn(0))[0]
    const after = plugin.applyMove(move, slice, turn(0))
    expect(after.board[at(4, 4)]).toBe(null)
    expect(after.board[move.to].under).toEqual([
      { type: 'man', owner: 1 }, { type: 'king', owner: 1 },
    ])
  })

  it('reads ownership and move type from the top of the column', () => {
    // A black man buried under a white king: the column is white's, and moves
    // as a king.
    const { plugin, slice } = position({
      [at(4, 4)]: king(0, [{ type: 'man', owner: 1 }]),
    })
    const targets = plugin.getLegalMoves(slice, turn(0)).map(m => m.to)
    expect(targets).toContain(at(0, 0))
    expect(plugin.getLegalMoves(slice, turn(1))).toHaveLength(0)
  })

  it('adds prisoners in the order they were taken', () => {
    const { plugin, slice } = position({
      [at(6, 0)]: man(0),
      [at(5, 1)]: man(1), [at(3, 3)]: king(1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.captures?.length === 2)
    expect(move).toBeDefined()
    const after = plugin.applyMove(move, slice, turn(0))
    expect(after.board[move.to].under).toEqual([
      { type: 'man', owner: 1 }, { type: 'king', owner: 1 },
    ])
  })

  it('promotes on the top piece and keeps the column beneath', () => {
    const { plugin, slice } = position({
      [at(1, 1)]: man(0, [{ type: 'man', owner: 1 }]),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.to === at(0, 0) || m.to === at(0, 2))
    const after = plugin.applyMove(move, slice, turn(0))
    expect(after.board[move.to].type).toBe('king')
    expect(after.board[move.to].under).toEqual([{ type: 'man', owner: 1 }])
  })

  it('leaves a variant without columns removing captures as before', () => {
    const plain = createDraughtsPlugin({ ...BASHNI, columns: false })
    const slice = plain.init({}, { request: () => null })
    slice.board = new Array(64).fill(null)
    slice.board[at(4, 4)] = man(0)
    slice.board[at(3, 5)] = man(1)
    const move = plain.getLegalMoves(slice, turn(0)).find(m => m.captures?.length)
    const after = plain.applyMove(move, slice, turn(0))
    expect(after.board[at(3, 5)]).toBe(null)
    expect(pieceCount(after.board)).toBe(1)
  })

  describe.each([['bashni', 24], ['lasca', 22]])('%s', (variant, pieces) => {
    it(`buries rather than removes: ${pieces} pieces from first move to last`, () => {
      for (const seed of [1, 2, 3]) {
        const game = createGameForFamily('draughts', { variant, rngSeed: seed })
        const rng = createRng(seed)
        const board = () => { const s = game.getState(); return (s?.slice || s).board }
        expect(pieceCount(board())).toBe(pieces)

        let outcome = 'timeout'
        let tallest = 1
        for (let i = 0; i < 600; i++) {
          const moves = game.getLegalMoves()
          if (!moves.length) { outcome = 'no-moves'; break }
          const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
          if (!result || !result.ok) { outcome = 'rejected'; break }
          expect(pieceCount(board())).toBe(pieces)
          for (const cell of board()) if (cell) tallest = Math.max(tallest, 1 + (cell.under?.length || 0))
          if (result.winner !== undefined && result.winner !== null) { outcome = `winner:${result.winner}`; break }
        }
        expect(outcome).not.toBe('timeout')
        expect(outcome).not.toBe('rejected')
        // A game in which nothing was ever buried would pass the count above
        // without exercising any of this.
        expect(tallest).toBeGreaterThan(2)
      }
    })
  })
})
