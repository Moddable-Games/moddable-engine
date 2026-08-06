import '../../plugins/chess/index.js'
import '../test-helpers/setup-rules-reader.js'
import { getVariantConfig } from '../src/variant-registry.js'
import { createGameForFamily } from '../src/play.js'
import { createGameController } from '../src/game-controller.js'
import { definitionFromVariant } from '../src/variant-definition.js'

const CHESS_DEFAULTS = { topology: { type: 'grid', rows: 8, cols: 8 }, players: ['white', 'black'] }

function createViaPlayPage(variant) {
  return createGameForFamily('chess', { variant })
}

describe('construction-path: play-page definition carries variant features', () => {
  it('cylinder-chess: topology.wrap survives the definition path', () => {
    const game = createGameForFamily('chess', { variant: 'cylinder-chess' })
    expect(game.raw.topology.wrap).toBe('files')
  })

  it('toroidal-chess: topology.wrap survives the definition path', () => {
    const game = createGameForFamily('chess', { variant: 'toroidal-chess' })
    expect(game.raw.topology.wrap).toBe('torus')
  })

  it('teleportChess: actions and initState survive the definition path', () => {
    const game = createViaPlayPage('teleportChess')
    const moves = game.getLegalMoves()
    const teleportMoves = moves.filter(m => m.action === 'teleport')
    expect(teleportMoves.length).toBeGreaterThan(0)
    expect(game.getState().slice._teleportTokens).toBeDefined()
  })

  it('crazyhouse: actions.drop survives the definition path', () => {
    const game = createViaPlayPage('crazyhouse')
    game.applyMove(game.getLegalMoves().find(m => m.from === 52 && m.to === 36))
    game.applyMove(game.getLegalMoves().find(m => m.from === 11 && m.to === 27))
    game.applyMove(game.getLegalMoves().find(m => m.from === 36 && m.to === 27))
    const state = game.getState().slice
    expect(state.hands[0].length).toBe(1)
    game.applyMove(game.getLegalMoves().find(m => m.from === 12 && m.to === 28))
    const drops = game.getLegalMoves().filter(m => m.action === 'drop')
    expect(drops.length).toBeGreaterThan(0)
  })

  it('duckChess: actions.blocker and turnLogic survive the definition path', () => {
    const game = createViaPlayPage('duckChess')
    const e2e4 = game.getLegalMoves().find(m => m.from === 52 && m.to === 36)
    const result = game.applyMove(e2e4)
    expect(result.continueTurn).toBe(true)
    const duckMoves = game.getLegalMoves().filter(m => m.action === 'blocker')
    expect(duckMoves.length).toBeGreaterThan(0)
  })

  it('sittuyin: actions.place and placementPieces survive the definition path', () => {
    const game = createViaPlayPage('sittuyin')
    const state = game.getState().slice
    expect(state.phase).toBe('placement')
    const placeMoves = game.getLegalMoves().filter(m => m.action === 'place')
    expect(placeMoves.length).toBeGreaterThan(0)
  })

  it('darkChess: visibility survives the definition path', () => {
    const game = createViaPlayPage('darkChess')
    const visibility = game.getVisibility(0)
    expect(visibility).not.toBeNull()
    const unknownCount = [...visibility.values()].filter(v => v === 'unknown').length
    expect(unknownCount).toBeGreaterThan(0)
  })

  it('ouk-chaktrang: kingLeap action and once-only state survive the definition path', () => {
    const game = createViaPlayPage('ouk-chaktrang')
    const leaps = game.getLegalMoves().filter(m => m.action === 'kingLeap')
    expect(leaps.length).toBeGreaterThan(0)
    game.applyMove(leaps[0])
    game.applyMove(game.getLegalMoves()[0])
    const leaps2 = game.getLegalMoves().filter(m => m.action === 'kingLeap')
    expect(leaps2.length).toBe(0)
  })

  it('progressive: turnLogic survives the definition path', () => {
    const game = createViaPlayPage('progressive')
    const e2e4 = game.getLegalMoves().find(m => m.from === 52 && m.to === 36)
    const result = game.applyMove(e2e4)
    expect(result.continueTurn).toBeFalsy()
    expect(game.currentPlayer()).toBe('black')
  })

  describe('duckChess full turn via controller', () => {
    it('normal move → continueTurn → duck offered → placed → turn passes', () => {
      const game = createViaPlayPage('duckChess')
      const moves = []
      const ctrl = createGameController(game.raw, {
        family: 'chess',
        players: { white: 'human', black: 'human' },
        onRender: () => {},
        onMove: (m, p) => moves.push({ action: m.action, from: m.from, to: m.to }),
      })

      ctrl.handleClick(62)
      ctrl.handleClick(45)
      expect(moves.length).toBe(1)
      expect(ctrl.currentPlayer()).toBe('white')

      const duckMoves = ctrl.getLegalMoves().filter(m => m.action === 'blocker')
      expect(duckMoves.length).toBeGreaterThan(0)

      ctrl.handleClick(duckMoves[0].to)
      expect(moves.length).toBe(2)
      expect(moves[1].action).toBe('blocker')
      expect(ctrl.currentPlayer()).toBe('black')
    })
  })

  describe('captured tray undo alignment', () => {
    it('capture, undo, recapture keeps histories aligned', () => {
      const game = createViaPlayPage('standard')
      const moveLog = []
      let boardSnap = null
      const captureLog = []
      const ctrl = createGameController(game.raw, {
        family: 'chess',
        players: { white: 'human', black: 'human' },
        onRender: () => {},
        onBeforeMove: () => {
          const slice = game.raw.getState('chess')
          boardSnap = slice.board ? [...slice.board] : null
        },
        onMove: (move, player) => {
          moveLog.push({ move, player })
          const isCapture = move.capture || move.enPassant
          if (isCapture && boardSnap && move.to !== undefined) {
            const captured = boardSnap[move.to]
            captureLog.push(captured ? captured.type : null)
          } else {
            captureLog.push(null)
          }
          boardSnap = null
        },
      })

      ctrl.handleClick(52); ctrl.handleClick(36)
      ctrl.handleClick(11); ctrl.handleClick(27)
      ctrl.handleClick(36); ctrl.handleClick(27)
      expect(moveLog.length).toBe(3)
      expect(captureLog.length).toBe(3)
      expect(captureLog[2]).toBe('pawn')

      ctrl.undo()
      expect(moveLog.length).toBe(3)
      expect(captureLog.length).toBe(3)

      const undoCount = ctrl.getState().undoCount
      const aligned = moveLog.length >= undoCount
      expect(aligned).toBe(true)

      ctrl.handleClick(36); ctrl.handleClick(27)
      expect(moveLog.length).toBe(4)
      expect(captureLog.length).toBe(4)
      expect(captureLog[3]).toBe('pawn')
    })
  })
})
