import { createXiangqiPlugin } from '../index.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#162. Janggi is Xiangqi's Korean cousin and differs in four ways that
// all needed saying rather than coding: the palace is drawn with an X and a
// piece may only move diagonally along a line that is drawn, the Elephant turns
// the other way from Xiangqi's, the Cannon must jump to move as well as to
// capture, and two Generals facing on an open file is bikjang rather than an
// illegal position.

const COLS = 9
const at = (r, c) => r * COLS + c
const request = () => null
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const JANGGI = {
  rows: 10, cols: 9, hasRiver: false, cannonJumpToMove: true,
  palaceDiagonals: true, flyingGeneralRule: false,
  passAllowed: true, bikjangDraw: true,
  pieceMoves: {
    general: { type: 'rider', dirs: 'all', maxSteps: 1, constraint: 'palace' },
    advisor: { type: 'rider', dirs: 'all', maxSteps: 1, constraint: 'palace' },
    elephant: { type: 'bent', first: 'orthogonal', firstSteps: 1, second: 'diagonal', secondSteps: 2 },
    chariot: { type: 'rider', dirs: 'all' },
    soldier: { type: 'leaper', offsets: [[-1, 0], [0, -1], [0, 1]], directional: true },
  },
}

function position(cells, config = JANGGI) {
  const plugin = createXiangqiPlugin(config)
  plugin.init({}, { request })
  const board = new Array(90).fill(null)
  for (const [index, piece] of Object.entries(cells)) board[index] = piece
  return { plugin, slice: { board, _cols: COLS } }
}

const piece = (type, owner = 0) => ({ type, owner })
const targets = (plugin, slice, from, seat = 0) =>
  plugin.getLegalMoves(slice, turn(seat)).filter(m => m.from === from).map(m => m.to).sort((a, b) => a - b)

// Seat 0's palace is rows 7-9, cols 3-5; its centre is (8,4).
describe('janggi (engine#162)', () => {
  describe('palace diagonals', () => {
    it('lets the General move diagonally from the centre to a corner', () => {
      const { plugin, slice } = position({ [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1) })
      const reach = targets(plugin, slice, at(8, 4))
      expect(reach).toContain(at(7, 3))
      expect(reach).toContain(at(9, 5))
    })

    it('refuses a diagonal from a palace edge, where no line is drawn', () => {
      // (7,4) is the top middle of seat 0's palace: orthogonally connected,
      // and on none of the palace's diagonals.
      const { plugin, slice } = position({ [at(7, 4)]: piece('general'), [at(0, 2)]: piece('general', 1) })
      const reach = targets(plugin, slice, at(7, 4))
      expect(reach).toContain(at(8, 4))
      expect(reach).toContain(at(7, 3))
      expect(reach).not.toContain(at(8, 3))
      expect(reach).not.toContain(at(8, 5))
    })

    it('lets the Chariot run the palace diagonal corner to corner', () => {
      const { plugin, slice } = position({
        [at(7, 3)]: piece('chariot'), [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
      })
      // Blocked at the centre by its own General, so only as far as it can go;
      // with the centre clear it reaches the far corner.
      const clear = position({ [at(7, 3)]: piece('chariot'), [at(9, 4)]: piece('general'), [at(0, 2)]: piece('general', 1) })
      expect(targets(clear.plugin, clear.slice, at(7, 3))).toContain(at(9, 5))
      expect(targets(plugin, slice, at(7, 3))).not.toContain(at(9, 5))
    })

    it('leaves a Chariot off the palace with no diagonal at all', () => {
      const { plugin, slice } = position({
        [at(5, 0)]: piece('chariot'), [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
      })
      expect(targets(plugin, slice, at(5, 0))).not.toContain(at(4, 1))
    })
  })

  describe('the elephant', () => {
    it('goes one orthogonally then two diagonally outward', () => {
      const { plugin, slice } = position({
        [at(5, 4)]: piece('elephant'), [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
      })
      const reach = targets(plugin, slice, at(5, 4))
      expect(reach).toContain(at(2, 2))
      expect(reach).toContain(at(2, 6))
      expect(reach).toContain(at(8, 2))
      // Never the Xiangqi elephant's two-square diagonal.
      expect(reach).not.toContain(at(3, 2))
    })

    it('is blocked by anything on either square it passes over', () => {
      const first = position({
        [at(5, 4)]: piece('elephant'), [at(4, 4)]: piece('soldier'),
        [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
      })
      expect(targets(first.plugin, first.slice, at(5, 4))).not.toContain(at(2, 2))

      const second = position({
        [at(5, 4)]: piece('elephant'), [at(3, 3)]: piece('soldier'),
        [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
      })
      expect(targets(second.plugin, second.slice, at(5, 4))).not.toContain(at(2, 2))
    })
  })

  describe('bikjang', () => {
    const facing = () => position({
      [at(8, 4)]: piece('general'), [at(1, 4)]: piece('general', 1),
      [at(5, 0)]: piece('chariot'),
    })

    it('offers only moves that break it, and the pass', () => {
      const { plugin, slice } = facing()
      const moves = plugin.getLegalMoves(slice, turn(0))
      expect(moves.some(m => m.action === 'pass')).toBe(true)
      // Every other move on offer must leave the file blocked or the General
      // elsewhere; a chariot move along its own rank leaves bikjang standing.
      expect(moves.some(m => m.from === at(5, 0) && m.to === at(5, 1))).toBe(false)
      expect(moves.some(m => m.from === at(5, 0) && m.to === at(5, 4))).toBe(true)
    })

    it('ends the game drawn when the player passes', () => {
      const { plugin, slice } = facing()
      const after = plugin.applyMove({ action: 'pass' }, slice, turn(0))
      expect(plugin.checkWin(after, turn(0))).toBe('draw')
    })

    it('does not draw on a pass when the Generals do not face', () => {
      const { plugin, slice } = position({
        [at(8, 4)]: piece('general'), [at(1, 3)]: piece('general', 1),
      })
      const after = plugin.applyMove({ action: 'pass' }, slice, turn(0))
      expect(plugin.checkWin(after, turn(0))).toBe(null)
    })
  })

  it('opens on 90 points with 32 pieces and reaches a terminal position', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGameForFamily('xiangqi', { variant: 'janggi', rngSeed: seed })
      const state = game.getState()
      expect((state?.slice || state).board.filter(Boolean)).toHaveLength(32)
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
