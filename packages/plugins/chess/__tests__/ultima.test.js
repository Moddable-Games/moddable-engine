import { createChessPlugin } from '../index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'
import { ultima } from '../src/variants/ultima.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#158. Ultima's premise is that every piece has its own way of taking
// and none of them is "move onto it". The engine gave all seven the queen's
// slide and the ordinary displacement capture, so it played as queens-and-rooks
// with a bare-king win - the movement was right and the game was not.
//
// Positions are built by hand from the rules text in moddable-rules.

const COLS = 8
const at = (r, c) => r * COLS + c
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const PIECES = {
  coordinator: { type: 'rider', dirs: 'all' },
  immobilizer: { type: 'rider', dirs: 'all' },
  longLeaper: { type: 'rider', dirs: 'all' },
  withdrawer: { type: 'rider', dirs: 'all' },
  chameleon: { type: 'rider', dirs: 'all' },
  pawn: { type: 'rider', dirs: 'orthogonal' },
}

function position(cells) {
  const topology = createGridTopology({ rows: 8, cols: 8 })
  const plugin = createChessPlugin({
    rows: 8, cols: 8, castling: false, enPassant: false, doubleStep: false,
    pieces: PIECES, ...ultima,
  })
  plugin.init({}, { request: (key) => (key === 'core.topology' ? topology : null) })
  const board = new Array(64).fill(null)
  for (const [index, piece] of Object.entries(cells)) board[index] = piece
  return { plugin, slice: { board, halfmoveClock: 0, fullmoveNumber: 1 } }
}

const p = (type, owner = 0) => ({ type, owner })

function movesFrom(plugin, slice, from, seat = 0) {
  return plugin.getLegalMoves(slice, turn(seat)).filter(m => m.from === from)
}

function play(plugin, slice, move, seat = 0) {
  const result = plugin.applyMove(move, slice, turn(seat))
  return result.state || result
}

describe('ultima (engine#158)', () => {
  it('lets only the King take by moving onto a piece', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: p('withdrawer'), [at(4, 6)]: p('coordinator', 1),
      [at(7, 0)]: p('king'), [at(0, 0)]: p('king', 1),
    })
    const moves = movesFrom(plugin, slice, at(4, 4))
    expect(moves.some(m => m.to === at(4, 5))).toBe(true)
    expect(moves.some(m => m.to === at(4, 6))).toBe(false)
  })

  it('takes by withdrawal: moving directly away from an adjacent piece', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: p('withdrawer'), [at(4, 3)]: p('pawn', 1),
      [at(7, 0)]: p('king'), [at(0, 0)]: p('king', 1),
    })
    // Away along the same line takes it.
    const away = play(plugin, slice, { from: at(4, 4), to: at(4, 7) })
    expect(away.board[at(4, 3)]).toBe(null)
    // Any other line takes nothing.
    const aside = play(plugin, slice, { from: at(4, 4), to: at(2, 4) })
    expect(aside.board[at(4, 3)]).not.toBe(null)
  })

  it('takes by coordination: the two corners of the rectangle with its King', () => {
    // King on (7,0), Coordinator sliding to (4,4): the two corners of that
    // rectangle are (7,4) and (4,0), and both enemies standing on them go.
    const { plugin, slice } = position({
      [at(7, 0)]: p('king'), [at(2, 2)]: p('coordinator'),
      [at(7, 4)]: p('pawn', 1), [at(4, 0)]: p('pawn', 1),
      [at(0, 7)]: p('king', 1),
    })
    const after = play(plugin, slice, { from: at(2, 2), to: at(4, 4) })
    expect(after.board[at(7, 4)]).toBe(null)
    expect(after.board[at(4, 0)]).toBe(null)

    // A square whose corners are empty takes nothing.
    const miss = play(plugin, slice, { from: at(2, 2), to: at(3, 3) })
    expect(miss.board[at(7, 4)]).not.toBe(null)
    expect(miss.board[at(4, 0)]).not.toBe(null)
  })

  it('takes by leaping: over an enemy onto the empty square beyond', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: p('longLeaper'), [at(4, 5)]: p('pawn', 1),
      [at(7, 0)]: p('king'), [at(0, 0)]: p('king', 1),
    })
    const leap = plugin.getLegalMoves(slice, turn(0))
      .find(m => m.action === 'leap' && m.from === at(4, 4))
    expect(leap).toBeDefined()
    expect(leap.to).toBe(at(4, 6))
    const after = play(plugin, slice, leap)
    expect(after.board[at(4, 5)]).toBe(null)
    expect(after.board[at(4, 6)]).toEqual(p('longLeaper'))
  })

  it('leaps more than one enemy in a move', () => {
    const { plugin, slice } = position({
      [at(4, 0)]: p('longLeaper'), [at(4, 1)]: p('pawn', 1), [at(4, 3)]: p('pawn', 1),
      [at(7, 7)]: p('king'), [at(0, 7)]: p('king', 1),
    })
    const doubles = plugin.getLegalMoves(slice, turn(0))
      .filter(m => m.action === 'leap' && m.leapt.length === 2)
    expect(doubles.length).toBeGreaterThan(0)
    const after = play(plugin, slice, doubles[0])
    expect(after.board[at(4, 1)]).toBe(null)
    expect(after.board[at(4, 3)]).toBe(null)
  })

  it('takes by pinching: sandwiching along a rank or file, never a diagonal', () => {
    const { plugin, slice } = position({
      [at(4, 0)]: p('pawn'), [at(4, 2)]: p('pawn', 1), [at(4, 3)]: p('coordinator'),
      [at(7, 7)]: p('king'), [at(0, 7)]: p('king', 1),
    })
    const after = play(plugin, slice, { from: at(4, 0), to: at(4, 1) })
    expect(after.board[at(4, 2)]).toBe(null)
  })

  it('freezes what stands next to an Immobilizer, and nothing else', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: p('immobilizer', 1), [at(4, 5)]: p('withdrawer'),
      [at(1, 1)]: p('withdrawer'),
      [at(7, 0)]: p('king'), [at(0, 0)]: p('king', 1),
    })
    expect(movesFrom(plugin, slice, at(4, 5))).toHaveLength(0)
    expect(movesFrom(plugin, slice, at(1, 1)).length).toBeGreaterThan(0)
  })

  it('lets a Chameleon freeze the Immobilizer that freezes it', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: p('immobilizer', 1), [at(4, 5)]: p('chameleon'),
      [at(7, 0)]: p('king'), [at(0, 0)]: p('king', 1),
    })
    expect(movesFrom(plugin, slice, at(4, 5))).toHaveLength(0)
    expect(movesFrom(plugin, slice, at(4, 4), 1)).toHaveLength(0)
  })

  it('lets a Chameleon take a Withdrawer by withdrawing, and nothing else that way', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: p('chameleon'), [at(4, 3)]: p('withdrawer', 1),
      [at(7, 0)]: p('king'), [at(0, 0)]: p('king', 1),
    })
    const takes = play(plugin, slice, { from: at(4, 4), to: at(4, 7) })
    expect(takes.board[at(4, 3)]).toBe(null)

    const other = position({
      [at(4, 4)]: p('chameleon'), [at(4, 3)]: p('coordinator', 1),
      [at(7, 0)]: p('king'), [at(0, 0)]: p('king', 1),
    })
    const spared = play(other.plugin, other.slice, { from: at(4, 4), to: at(4, 7) })
    expect(spared.board[at(4, 3)]).not.toBe(null)
  })

  it('is won by taking the King, with no check and no checkmate', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: p('withdrawer'), [at(7, 0)]: p('king'),
    })
    expect(plugin.checkWin(slice, turn(0))).toBe(0)
  })

  it('plays a whole game from the corpus and reaches a terminal position', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGameForFamily('chess', { variant: 'ultima', rngSeed: seed })
      const rng = createRng(seed)
      let outcome = 'timeout'
      for (let i = 0; i < 400; i++) {
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
