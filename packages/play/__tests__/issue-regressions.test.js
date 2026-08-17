import { createGameForFamily } from '../src/play.js'
import { createGameController } from '../src/game-controller.js'
import { deriveCompatibleFlags, familySupportsFlag } from '../src/variant-flags.js'
import '../test-helpers/setup-rules-reader.js'

function controllerForVariant(family, variant, opts = {}) {
  const game = createGameForFamily(family, { variant, rngSeed: 42, ...opts })
  const names = game.raw.playerSystem.getAll()
  const players = Object.fromEntries(names.map(n => [n, 'human']))
  return { game, ctrl: createGameController(game.raw, { family, players, ...opts }) }
}

describe('#121 — player 0 wins must not be reported as draw', () => {
  test('fool\'s mate: black (index 1) wins via pipeline — baseline', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
    game.applyMove({ from: 53, to: 45 })
    game.applyMove({ from: 12, to: 28 })
    game.applyMove({ from: 54, to: 38 })
    const result = game.applyMove({ from: 3, to: 39 })
    expect(result.winner).toBe(1)
  })

  test('scholar\'s mate: white (index 0) wins — the falsy-zero bug', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
    game.applyMove({ from: 52, to: 36 })
    game.applyMove({ from: 12, to: 28 })
    game.applyMove({ from: 61, to: 34 })
    game.applyMove({ from: 1, to: 18 })
    game.applyMove({ from: 59, to: 45 })
    game.applyMove({ from: 9, to: 25 })
    const result = game.applyMove({ from: 45, to: 13 })
    expect(result.winner).toBe(0)
  })

  test('winner 0 does not advance the turn', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
    game.applyMove({ from: 52, to: 36 })
    game.applyMove({ from: 12, to: 28 })
    game.applyMove({ from: 61, to: 34 })
    game.applyMove({ from: 1, to: 18 })
    game.applyMove({ from: 59, to: 45 })
    game.applyMove({ from: 9, to: 25 })
    game.applyMove({ from: 45, to: 13 })
    expect(game.currentPlayer()).toBe('white')
  })
})

describe('#124 — flags only offered on families that consume them', () => {
  test('go does not support drops or random', () => {
    expect(familySupportsFlag('go', 'drops')).toBe(false)
    expect(familySupportsFlag('go', 'random')).toBe(false)
  })

  test('draughts does not support drops or random', () => {
    expect(familySupportsFlag('draughts', 'drops')).toBe(false)
    expect(familySupportsFlag('draughts', 'random')).toBe(false)
  })

  test('xiangqi does not support drops or random', () => {
    expect(familySupportsFlag('xiangqi', 'drops')).toBe(false)
    expect(familySupportsFlag('xiangqi', 'random')).toBe(false)
  })

  test('reversi does not support drops or random', () => {
    expect(familySupportsFlag('reversi', 'drops')).toBe(false)
    expect(familySupportsFlag('reversi', 'random')).toBe(false)
  })

  test('shogi does not support drops or random', () => {
    expect(familySupportsFlag('shogi', 'drops')).toBe(false)
    expect(familySupportsFlag('shogi', 'random')).toBe(false)
  })

  test('chess supports both drops and random', () => {
    expect(familySupportsFlag('chess', 'drops')).toBe(true)
    expect(familySupportsFlag('chess', 'random')).toBe(true)
  })

  test('deriveCompatibleFlags returns empty for go', () => {
    const game = createGameForFamily('go', { variant: 'standard', rngSeed: 1 })
    const flags = deriveCompatibleFlags(game.raw.definition, 'go')
    expect(flags).toEqual([])
  })

  test('variants declaring drops already do not get a drops toggle', () => {
    const game = createGameForFamily('chess', { variant: 'hostage-chess', rngSeed: 1 })
    const flags = deriveCompatibleFlags(game.raw.definition, 'chess')
    expect(flags).not.toContain('drops')
  })
})

describe('#125 — river text placement', () => {
  test('xiangqi-42 gap decoration rows are outside board bounds', () => {
    const game = createGameForFamily('xiangqi', { variant: 'xiangqi-42', rngSeed: 1 })
    const def = game.raw.definition
    const render = def.render || {}
    const decorations = render.decorations || []
    const gapDec = decorations.find(d => d.type === 'gap')
    const rows = def.topology?.rows || 6
    if (gapDec) {
      const [rt, rb] = gapDec.rows
      expect(rb).toBeGreaterThan(rows - 2)
    }
  })
})

describe('#126 — uniformPieces collapses vocabulary', () => {
  test('one-colour go resolves with uniformPieces: true', () => {
    const game = createGameForFamily('go', { variant: 'one-colour', rngSeed: 1 })
    expect(game.raw.definition.render?.uniformPieces).toBe(true)
  })
})

describe('#127 — default seat derivation for multi-player', () => {
  test('four-player-shogi derives seat 2 (green, bottom army)', () => {
    const game = createGameForFamily('shogi', { variant: 'four-player-shogi', rngSeed: 1 })
    const board = game.getState().slice.board
    const cols = game.raw.definition.topology.cols
    const players = game.raw.playerSystem.getAll()
    const count = players.length
    const sum = new Array(count).fill(0)
    const n = new Array(count).fill(0)
    for (let i = 0; i < board.length; i++) {
      const o = board[i]?.owner
      if (o == null || o < 0 || o >= count) continue
      sum[o] += Math.floor(i / cols)
      n[o]++
    }
    let best = 0, bestMean = -Infinity
    for (let i = 0; i < count; i++) {
      if (!n[i]) continue
      const mean = sum[i] / n[i]
      if (mean > bestMean + 1e-9) { bestMean = mean; best = i }
    }
    expect(best).toBe(2)
  })

  test('standard chess: white (index 0) is at the bottom (highest mean row)', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
    const board = game.getState().slice.board
    const cols = game.raw.definition.topology.cols
    const sum = [0, 0], n = [0, 0]
    for (let i = 0; i < board.length; i++) {
      const o = board[i]?.owner
      if (o == null) continue
      sum[o] += Math.floor(i / cols)
      n[o]++
    }
    const mean0 = sum[0] / n[0]
    const mean1 = sum[1] / n[1]
    expect(mean0).toBeGreaterThan(mean1)
  })
})
