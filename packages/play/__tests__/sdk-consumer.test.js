/**
 * SDK consumer test — exercises @moddable/engine/play exactly as an external
 * consumer (moddable-tools, third-party MCP clients) does.
 *
 * This test imports ONLY from the public SDK entry point. It does NOT:
 * - Import plugin index.js files (which trigger registerVariants)
 * - Call setRulesReader (which enables frontmatter loading)
 * - Pass explicit definitions
 *
 * If this test fails, the public API is broken for external consumers even
 * if the playability standard passes (which uses the internal path).
 */

import {
  createGameForFamily,
  getFamilies,
  hasFamily,
  createGame,
  getLegalMoves,
  getGameStatus,
  renderSvg,
  listVariants,
} from '../index.js'

const EXPECTED_FAMILIES = ['chess', 'draughts', 'go', 'reversi', 'shogi', 'xiangqi']

describe('SDK consumer path (no frontmatter, no variant registration)', () => {
  test('getFamilies returns exactly the expected set', () => {
    const families = getFamilies()
    expect(families.sort()).toEqual(EXPECTED_FAMILIES.sort())
  })

  test('hasFamily is true for all expected families', () => {
    for (const f of EXPECTED_FAMILIES) {
      expect(hasFamily(f)).toBe(true)
    }
  })

  test('hasFamily is false for non-existent families', () => {
    expect(hasFamily('backgammon')).toBe(false)
    expect(hasFamily('mancala')).toBe(false)
    expect(hasFamily('hex')).toBe(false)
  })

  describe.each(EXPECTED_FAMILIES)('%s', (family) => {
    let game, state

    test('createGameForFamily succeeds without arguments', () => {
      game = createGameForFamily(family)
      expect(game).toBeDefined()
      expect(game.getLegalMoves).toBeDefined()
      expect(game.applyMove).toBeDefined()
      expect(game.getState).toBeDefined()
    })

    test('getState returns valid structure', () => {
      state = game.getState()
      expect(state.family).toBe(family)
      expect(state.slice).toBeDefined()
      expect(state.slice.board).toBeDefined()
    })

    test('getLegalMoves returns non-empty array', () => {
      const moves = game.getLegalMoves()
      expect(Array.isArray(moves)).toBe(true)
      expect(moves.length).toBeGreaterThan(0)
    })

    test('applyMove with first legal move changes state', () => {
      const moves = game.getLegalMoves()
      const move = moves[0]
      const before = JSON.stringify(game.getState().slice)
      const result = game.applyMove(move)
      expect(result.ok).toBe(true)
      const after = JSON.stringify(game.getState().slice)
      expect(after).not.toBe(before)
    })

    test('SDK createGame function works', () => {
      const g = createGame(family)
      expect(g).toBeDefined()
      const moves = g.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
    })

    test('SDK getLegalMoves function works with state', () => {
      const g = createGameForFamily(family)
      const s = g.getState()
      const moves = getLegalMoves(family, null, s.slice)
      expect(Array.isArray(moves)).toBe(true)
      expect(moves.length).toBeGreaterThan(0)
    })

    test('SDK getGameStatus reports active game', () => {
      const g = createGameForFamily(family)
      const s = g.getState()
      const status = getGameStatus(family, null, s.slice)
      expect(status.gameOver).toBe(false)
    })
  })
})
