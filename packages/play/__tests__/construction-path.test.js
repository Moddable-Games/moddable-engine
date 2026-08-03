import '../../plugins/chess/index.js'
import { getVariantConfig } from '../src/variant-registry.js'
import { createGameForFamily } from '../src/play.js'
import { createGameController } from '../src/game-controller.js'

const PLAY_ONLY_KEYS = new Set(['key', 'label', 'title', 'group', 'description', 'rule', 'board', 'extends', 'hidden', 'render', 'playerNames', 'definition', 'topology', 'rows', 'cols', 'size', 'players'])

function buildDefinitionFromResolved(family, variant, registryCfg) {
  const pluginConfig = {}
  for (const [k, v] of Object.entries(registryCfg)) {
    if (PLAY_ONLY_KEYS.has(k)) continue
    pluginConfig[k] = v
  }
  return {
    title: variant, slug: variant, parent: family,
    engine: { topology: { type: 'grid', rows: 8, cols: 8 }, players: ['white', 'black'], plugins: { [family]: pluginConfig } },
  }
}

function createViaPlayPage(variant) {
  const registryCfg = getVariantConfig('chess', variant) || {}
  const def = buildDefinitionFromResolved('chess', variant, registryCfg)
  return createGameForFamily('chess', { variant, definition: def })
}

describe('construction-path: play-page definition carries variant features', () => {
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
