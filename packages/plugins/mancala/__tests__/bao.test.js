import { createMancalaPlugin } from '../index.js'
import { createGameForFamily } from '../../../play/src/play.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createRng } from '../../../core/index.js'

// engine#169. Bao is the one variant in the family that is not two players
// sharing a ring. Each player has a private sixteen-pit circuit - an inner row
// facing the opponent and an outer row behind it - and a sow never leaves the
// sower's half. The only thing that crosses is the capture, which empties the
// pit directly opposite in the enemy inner row.
//
// Numbers are from the article the file cites: 32 seeds a side, ten on the
// board (six in the nyumba, the fourth pit from the right of the inner row, and
// two in each of the two pits to its right) and twenty-two in hand for namua.

const COLS = 8
const SIDE = 16
const p0 = (i) => i           // player 0: inner 0-7, outer 8-15
const p1 = (i) => SIDE + i    // player 1: inner 16-23, outer 24-31
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const BAO = {
  pitsPerSide: SIDE, cols: COLS, rowsPerSide: 2, hasStores: false,
  chooseDirection: true, captureRule: 'oppositeInnerRow', namuaReserve: 22,
}

function position(cells, reserve = [0, 0]) {
  const plugin = createMancalaPlugin(BAO)
  const slice = plugin.init({}, { request: () => null })
  slice.board = new Array(32).fill(0)
  for (const [index, seeds] of Object.entries(cells)) slice.board[index] = seeds
  slice.reserve = reserve.slice()
  return { plugin, slice }
}

const totalSeeds = (slice) =>
  slice.board.reduce((a, b) => a + b, 0) + (slice.reserve || [0, 0]).reduce((a, b) => a + b, 0)

describe('bao (engine#169)', () => {
  describe('the board', () => {
    it('opens with ten seeds a side on the board and twenty-two in hand', () => {
      const game = createGameForFamily('mancala', { variant: 'bao', rngSeed: 1 })
      const state = game.getState()
      const slice = state?.slice || state
      expect(slice.board).toHaveLength(32)
      expect(slice.reserve).toEqual([22, 22])
      expect(totalSeeds(slice)).toBe(64)
      for (const seat of [0, 1]) {
        const inner = slice.board.slice(seat * SIDE, seat * SIDE + COLS)
        expect(inner).toEqual([0, 0, 0, 0, 6, 2, 2, 0])
        expect(slice.board.slice(seat * SIDE + COLS, (seat + 1) * SIDE)).toEqual(new Array(8).fill(0))
      }
    })

    it('sows within the sower’s own half and never into the opponent’s', () => {
      // Twenty seeds from one pit is more than a lap of the sixteen-pit ring,
      // so if the circuit leaked it would leak here.
      const { plugin, slice } = position({ [p0(0)]: 20 })
      const after = plugin.applyMove({ action: 'sow', pit: p0(0), direction: 'counterclockwise' }, slice, turn(0))
      expect(after.board.slice(SIDE).every(n => n === 0)).toBe(true)
    })
  })

  describe('capture', () => {
    it('empties the enemy inner pit directly opposite, into the kichwa', () => {
      // One seed sown from inner 0 lands in inner 1, which faces the enemy inner
      // pit holding five. They come out and go to this player's right kichwa.
      const { plugin, slice } = position({ [p0(0)]: 1, [p1(6)]: 5 })
      const after = plugin.applyMove({ action: 'sow', pit: p0(0), direction: 'counterclockwise' }, slice, turn(0))
      expect(after.board[p1(6)]).toBe(0)
      expect(after.lastCaptured).toBe(5)
      // The seeds are not removed from play: they go to the kichwa and are sown
      // on from there, so they end up somewhere in this player's own half.
      expect(after.board.slice(0, SIDE).reduce((a, b) => a + b, 0)).toBe(6)
      expect(totalSeeds(after)).toBe(totalSeeds(slice))
    })

    it('takes nothing when the facing pit is empty', () => {
      const { plugin, slice } = position({ [p0(0)]: 1 })
      const after = plugin.applyMove({ action: 'sow', pit: p0(0), direction: 'counterclockwise' }, slice, turn(0))
      expect(after.lastCaptured).toBe(0)
    })

    it('never captures from a landing in the outer row', () => {
      // Outer pits face nothing: only the inner rows meet. Sown clockwise from
      // the first outer pit, the seed lands in the next outer pit and the enemy
      // inner row is untouched however full it is.
      const { plugin, slice } = position({ [p0(COLS)]: 1, [p1(0)]: 5, [p1(7)]: 5 })
      const after = plugin.applyMove({ action: 'sow', pit: p0(COLS), direction: 'clockwise' }, slice, turn(0))
      expect(after.lastLanded).toBe(p0(COLS + 1))
      expect(after.lastCaptured).toBe(0)
      expect(after.board[p1(0)]).toBe(5)
      expect(after.board[p1(7)]).toBe(5)
    })

    it('is compulsory when one is available', () => {
      const { plugin, slice } = position({ [p0(0)]: 1, [p0(COLS)]: 1, [p1(6)]: 5 })
      const moves = plugin.getLegalMoves(slice, turn(0))
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every(m => m.captures > 0)).toBe(true)
    })
  })

  describe('namua', () => {
    it('introduces one seed from the reserve into a non-empty inner pit', () => {
      const { plugin, slice } = position({ [p0(3)]: 2 }, [22, 22])
      const moves = plugin.getLegalMoves(slice, turn(0))
      expect(moves.every(m => m.action === 'namua')).toBe(true)
      expect(new Set(moves.map(m => m.pit))).toEqual(new Set([p0(3)]))

      const after = plugin.applyMove(moves[0], slice, turn(0))
      expect(after.reserve).toEqual([21, 22])
      expect(totalSeeds(after)).toBe(totalSeeds(slice))
    })

    it('offers no empty pit and no outer pit while the reserve lasts', () => {
      const { plugin, slice } = position({ [p0(3)]: 2, [p0(COLS + 1)]: 4 }, [22, 22])
      const moves = plugin.getLegalMoves(slice, turn(0))
      expect(moves.some(m => m.pit === p0(COLS + 1))).toBe(false)
    })

    it('sows from the outer row too once the reserve is spent', () => {
      const { plugin, slice } = position({ [p0(3)]: 2, [p0(COLS + 1)]: 4 }, [0, 0])
      const moves = plugin.getLegalMoves(slice, turn(0))
      expect(moves.every(m => m.action === 'sow')).toBe(true)
      expect(moves.some(m => m.pit === p0(COLS + 1))).toBe(true)
    })
  })

  it('offers both directions, and they are different games', () => {
    const { plugin, slice } = position({ [p0(3)]: 3 }, [0, 0])
    const moves = plugin.getLegalMoves(slice, turn(0))
    expect(new Set(moves.map(m => m.direction))).toEqual(new Set(['counterclockwise', 'clockwise']))
    const cw = plugin.applyMove(moves.find(m => m.direction === 'clockwise'), slice, turn(0))
    const ccw = plugin.applyMove(moves.find(m => m.direction === 'counterclockwise'), slice, turn(0))
    expect(cw.board).not.toEqual(ccw.board)
  })

  it('is lost by the player whose inner row empties', () => {
    const { plugin, slice } = position({ [p0(2)]: 4, [p1(COLS)]: 4 }, [0, 0])
    expect(plugin.checkWin(slice, turn(0))).toBe(0)
  })

  it('conserves its sixty-four seeds through a whole game', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGameForFamily('mancala', { variant: 'bao', rngSeed: seed })
      const rng = createRng(seed)
      let outcome = 'timeout'
      for (let i = 0; i < 800; i++) {
        const moves = game.getLegalMoves()
        if (!moves.length) { outcome = 'no-moves'; break }
        const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
        if (!result || !result.ok) { outcome = 'rejected'; break }
        const state = game.getState()
        expect(totalSeeds(state?.slice || state)).toBe(64)
        if (result.winner !== undefined && result.winner !== null) { outcome = `winner:${result.winner}`; break }
      }
      expect(outcome).not.toBe('timeout')
      expect(outcome).not.toBe('rejected')
    }
  })
})
