import { createXiangqiPlugin } from '../index.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'

// engine#162. Manchu Chess gives Black one super-piece in place of an army: the
// Banner moves as Chariot, Cannon and Horse at once. The rulebook called it "not
// a modelled piece type", and it turned out to need no plugin code at all - the
// piece-behaviour vocabulary the family already reads composes the three.
//
// Positions are built by hand and checked against the rules text rather than
// captured from a run.

const COLS = 9
const at = (r, c) => r * COLS + c
const request = () => null
const turn = (currentIndex = 0) => ({ __players: { currentIndex } })

const BANNER_SPEC = {
  type: 'compose',
  parts: [
    { type: 'rider', dirs: 'orthogonal' },
    { type: 'hopper', dirs: 'orthogonal', captureSlide: true },
    { type: 'leaper', offsets: 'knight', lame: 'orthogonal' },
  ],
}

function pluginWithBanner() {
  return createXiangqiPlugin({
    vocabulary: {
      general: { symbols: { 0: 'K', 1: 'k' } },
      chariot: { symbols: { 0: 'R', 1: 'r' } },
      horse: { symbols: { 0: 'H', 1: 'h' } },
      cannon: { symbols: { 0: 'C', 1: 'c' } },
      banner: { symbols: { 0: 'Z', 1: 'z' } },
    },
    pieceMoves: { banner: BANNER_SPEC },
  })
}

function movesFrom(pieces, from, seat = 0) {
  const plugin = pluginWithBanner()
  const board = new Array(90).fill(null)
  for (const [index, piece] of Object.entries(pieces)) board[index] = piece
  const state = { board, _cols: COLS }
  return plugin.getLegalMoves(state, turn(seat))
    .filter(m => m.from === from)
    .map(m => m.to)
    .sort((a, b) => a - b)
}

const banner = (owner = 0) => ({ type: 'banner', owner })
const chariot = (owner = 0) => ({ type: 'chariot', owner })
const general = (owner = 0) => ({ type: 'general', owner })

describe('the Banner (engine#162)', () => {
  const home = at(5, 4)

  it('slides orthogonally like a Chariot', () => {
    const targets = movesFrom({ [home]: banner(), [at(9, 4)]: general() }, home)
    // Whole rank and file, minus its own square.
    expect(targets).toContain(at(5, 0))
    expect(targets).toContain(at(5, 8))
    expect(targets).toContain(at(0, 4))
    expect(targets).toContain(at(8, 4))
  })

  it('leaps like a Horse', () => {
    const targets = movesFrom({ [home]: banner(), [at(9, 4)]: general() }, home)
    for (const cell of [at(3, 3), at(3, 5), at(7, 3), at(7, 5), at(4, 2), at(6, 2), at(4, 6), at(6, 6)]) {
      expect(targets).toContain(cell)
    }
  })

  it('is blocked in a leg the way a Horse is', () => {
    const blocked = movesFrom(
      { [home]: banner(), [at(4, 4)]: chariot(0), [at(9, 4)]: general() },
      home
    )
    // The two leaps whose first orthogonal step is the occupied square go.
    expect(blocked).not.toContain(at(3, 3))
    expect(blocked).not.toContain(at(3, 5))
    // The ones that step sideways first are unaffected.
    expect(blocked).toContain(at(4, 2))
    expect(blocked).toContain(at(4, 6))
  })

  it('captures over a screen like a Cannon', () => {
    // A friendly screen at (5,6) and an enemy beyond it at (5,8): a Chariot
    // could reach neither, and the Cannon half of the Banner takes the enemy.
    const targets = movesFrom(
      { [home]: banner(), [at(5, 6)]: chariot(0), [at(5, 8)]: chariot(1), [at(9, 4)]: general() },
      home
    )
    expect(targets).toContain(at(5, 8))
    expect(targets).not.toContain(at(5, 6))
  })

  it('does not walk through the screen it hops over', () => {
    const targets = movesFrom(
      { [home]: banner(), [at(5, 6)]: chariot(0), [at(5, 7)]: chariot(1), [at(9, 4)]: general() },
      home
    )
    // The first cell beyond the screen is the enemy: taken by the hop.
    expect(targets).toContain(at(5, 7))
    // Nothing past it.
    expect(targets).not.toContain(at(5, 8))
  })

  it('reaches more squares than a Chariot on the same square', () => {
    const plugin = pluginWithBanner()
    const asBanner = movesFrom({ [home]: banner(), [at(9, 4)]: general() }, home).length
    const board = new Array(90).fill(null)
    board[home] = chariot(0)
    board[at(9, 4)] = general()
    const asChariot = plugin.getLegalMoves({ board, _cols: COLS }, turn(0))
      .filter(m => m.from === home).length
    expect(asBanner).toBeGreaterThan(asChariot)
    expect(asBanner - asChariot).toBe(8)
  })
})

describe('manchu-plus as the corpus declares it (engine#162)', () => {
  const state = () => {
    const game = createGameForFamily('xiangqi', { variant: 'manchu-plus', rngSeed: 1 })
    const s = game.getState()
    return { game, slice: s?.slice || s }
  }

  it('gives Red a standard army and Black the Manchu one', () => {
    const { slice } = state()
    const count = (owner) => {
      const out = {}
      slice.board.forEach(cell => { if (cell && cell.owner === owner) out[cell.type] = (out[cell.type] || 0) + 1 })
      return out
    }
    expect(count(0)).toEqual({ chariot: 2, horse: 2, elephant: 2, advisor: 2, general: 1, cannon: 2, soldier: 5 })
    // No Horses, no Cannons, one Chariot, one Banner.
    expect(count(1)).toEqual({ chariot: 1, elephant: 2, advisor: 2, general: 1, banner: 1, soldier: 5 })
  })

  it('puts the Banner on a Chariot square and the Soldiers on theirs', () => {
    const { slice } = state()
    expect(slice.board[at(0, 8)]).toEqual({ type: 'banner', owner: 1 })
    expect(slice.board[at(0, 0)]).toEqual({ type: 'chariot', owner: 1 })
    // Standard Xiangqi soldier rank for the far seat, the same one `standard`
    // uses: rank 7, which is row 3.
    for (const col of [0, 2, 4, 6, 8]) {
      expect(slice.board[at(3, col)]).toEqual({ type: 'soldier', owner: 1 })
    }
    expect(slice.board.slice(at(2, 0), at(3, 0)).filter(Boolean)).toEqual([])
  })

  it.each([1, 2, 3])('reaches a terminal position from seed %i', (seed) => {
    const game = createGameForFamily('xiangqi', { variant: 'manchu-plus', rngSeed: seed })
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
  })
})
