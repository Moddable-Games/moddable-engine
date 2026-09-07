import { createXiangqiPlugin } from '../index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#162. Quang Trung's entry claimed only that "pawn promotion as an
// alternate win condition is not modelled". None of its seven piece types was:
// it played as ordinary Xiangqi on a 10x10 checkered board. Every piece is the
// designer's own or adapted, and two of them needed engine support rather than
// declaration - a Chariot that captures by jumping the target, and a General and
// Pawns confined to the middle files at all times.

const COLS = 10
const at = (r, c) => r * COLS + c
const request = () => null
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const QT = {
  rows: 10, cols: 10, hasRiver: false, flyingGeneralRule: false,
  firstMoveRows: [7, 2], pawnAdvanceWin: 'soldier',
  pieceMoves: {
    general: { type: 'bent', first: 'diagonal', firstSteps: 1, secondSteps: 1, constraint: { cols: [2, 7] } },
    counsellor: { type: 'leaper', offsets: [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [-2, 2], [2, -2], [2, 2]] },
    elephant: { type: 'leaper', offsets: 'camel' },
    cannon: { type: 'rider', dirs: 'diagonal' },
    chariot: { divergent: { move: { type: 'rider', dirs: 'orthogonal' }, capture: { type: 'locust', dirs: 'orthogonal' } } },
    soldier: {
      type: 'leaper', offsets: [[-1, -1], [-1, 1]], directional: true,
      constraint: { cols: [2, 7] },
      firstMove: { type: 'rider', dirs: [[-1, 0]], maxSteps: 2, minSteps: 2 },
    },
  },
}

function position(cells) {
  // A real topology: the locust capture asks it for jump pairs, and the
  // fallback the plugin builds for bare unit tests has none.
  const topology = createGridTopology({ rows: 10, cols: 10 })
  const plugin = createXiangqiPlugin(QT)
  plugin.init({}, { request: (key) => (key === 'core.topology' ? topology : null) })
  const board = new Array(100).fill(null)
  for (const [index, p] of Object.entries(cells)) board[index] = p
  return { plugin, slice: { board, _cols: COLS } }
}

const piece = (type, owner = 0) => ({ type, owner })
const targets = (plugin, slice, from, seat = 0) =>
  plugin.getLegalMoves(slice, turn(seat)).filter(m => m.from === from).map(m => m.to).sort((a, b) => a - b)

describe('quang trung (engine#162)', () => {
  it('moves the Chariot orthogonally without taking anything it passes', () => {
    const { plugin, slice } = position({
      [at(5, 0)]: piece('chariot'), [at(8, 4)]: piece('general'), [at(0, 4)]: piece('general', 1),
    })
    const reach = targets(plugin, slice, at(5, 0))
    expect(reach).toContain(at(5, 9))
    expect(reach).toContain(at(0, 0))
  })

  it('captures with the Chariot by jumping the target onto the square beyond', () => {
    const { plugin, slice } = position({
      [at(5, 0)]: piece('chariot'), [at(5, 1)]: piece('soldier', 1),
      [at(8, 4)]: piece('general'), [at(0, 4)]: piece('general', 1),
    })
    const jump = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(5, 0) && m.to === at(5, 2))
    expect(jump).toBeDefined()
    expect(jump.captured).toBe(at(5, 1))
    const after = plugin.applyMove(jump, slice, turn(0))
    expect(after.board[at(5, 1)]).toBe(null)
    expect(after.board[at(5, 2)]).toEqual(piece('chariot'))
    // It may not simply move onto the piece.
    expect(targets(plugin, slice, at(5, 0))).not.toContain(at(5, 1))
  })

  it('will not jump onto an occupied square', () => {
    const { plugin, slice } = position({
      [at(5, 0)]: piece('chariot'), [at(5, 1)]: piece('soldier', 1), [at(5, 2)]: piece('soldier', 1),
      [at(8, 4)]: piece('general'), [at(0, 4)]: piece('general', 1),
    })
    expect(targets(plugin, slice, at(5, 0))).not.toContain(at(5, 2))
  })

  it('moves the General one diagonal step then one orthogonal, in that order', () => {
    const { plugin, slice } = position({
      [at(5, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
    })
    const reach = targets(plugin, slice, at(5, 4))
    // (4,3) then straight on: (3,3) or (4,2). Never a plain single step.
    expect(reach).toContain(at(3, 3))
    expect(reach).toContain(at(4, 2))
    expect(reach).not.toContain(at(4, 4))
    expect(reach).not.toContain(at(4, 3))
  })

  it('keeps the General and the Pawns inside files c to h', () => {
    const { plugin, slice } = position({
      [at(5, 2)]: piece('general'), [at(5, 3)]: piece('soldier'),
      [at(0, 5)]: piece('general', 1),
    })
    for (const from of [at(5, 2), at(5, 3)]) {
      for (const to of targets(plugin, slice, from)) {
        const file = to % COLS
        expect(file).toBeGreaterThanOrEqual(2)
        expect(file).toBeLessThanOrEqual(7)
      }
    }
  })

  it('gives a Pawn its straight double step only from its own rank', () => {
    const home = position({
      [at(7, 4)]: piece('soldier'), [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
    })
    expect(targets(home.plugin, home.slice, at(7, 4))).toContain(at(5, 4))

    const away = position({
      [at(6, 4)]: piece('soldier'), [at(8, 4)]: piece('general'), [at(0, 2)]: piece('general', 1),
    })
    expect(targets(away.plugin, away.slice, at(6, 4))).not.toContain(at(4, 4))
    // Diagonally forward is all it ever has otherwise.
    expect(targets(away.plugin, away.slice, at(6, 4))).toEqual([at(5, 3), at(5, 5)])
  })

  it('wins when a Pawn reaches the far rank uncapturable', () => {
    const safe = position({
      [at(0, 4)]: piece('soldier'), [at(8, 4)]: piece('general'), [at(2, 2)]: piece('general', 1),
    })
    expect(safe.plugin.checkWin(safe.slice, turn(0))).toBe(0)
  })

  it('does not win when that Pawn can be taken', () => {
    // A Chariot takes by jumping the target, so it must stand beside the Pawn
    // with the square beyond it empty.
    const exposed = position({
      [at(0, 4)]: piece('soldier'), [at(8, 4)]: piece('general'),
      [at(2, 2)]: piece('general', 1), [at(0, 5)]: piece('chariot', 1),
    })
    expect(exposed.plugin.checkWin(exposed.slice, turn(0))).toBe(null)
  })

  it('opens on 100 points with 36 pieces across seven types', () => {
    const state = createGameForFamily('xiangqi', { variant: 'quang-trung', rngSeed: 1 }).getState()
    const slice = state?.slice || state
    expect(slice.board.filter(Boolean)).toHaveLength(36)
    expect(new Set(slice.board.filter(Boolean).map(c => c.type))).toEqual(
      new Set(['chariot', 'horse', 'elephant', 'counsellor', 'general', 'cannon', 'soldier'])
    )
  })

  it('never offers a General or Pawn a move outside the middle files', () => {
    const game = createGameForFamily('xiangqi', { variant: 'quang-trung', rngSeed: 2 })
    const rng = createRng(2)
    for (let i = 0; i < 200; i++) {
      const state = game.getState()
      const board = (state?.slice || state).board
      const moves = game.getLegalMoves()
      if (!moves.length) break
      for (const m of moves) {
        const mover = board[m.from]
        if (!mover || (mover.type !== 'general' && mover.type !== 'soldier')) continue
        const file = m.to % COLS
        expect(file).toBeGreaterThanOrEqual(2)
        expect(file).toBeLessThanOrEqual(7)
      }
      const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
      if (!result || !result.ok || result.winner) break
    }
  })
})
