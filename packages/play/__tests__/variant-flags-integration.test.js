import { createGameForFamily } from '../src/play.js'
import '../test-helpers/setup-rules-reader.js'

describe('variant flags integration', () => {
  test('grand+random resolves and creates a game', () => {
    const game = createGameForFamily('chess', { variant: 'grand+random', rngSeed: 123 })
    expect(game).toBeDefined()
    const state = game.getState()
    expect(state.slice.board).toBeDefined()
    expect(state.slice.board.length).toBeGreaterThan(64)
  })

  test('random flag produces different positions per seed', () => {
    const game1 = createGameForFamily('chess', { variant: 'standard+random', rngSeed: 1 })
    const game2 = createGameForFamily('chess', { variant: 'standard+random', rngSeed: 2 })
    const board1 = game1.getState().slice.board
    const board2 = game2.getState().slice.board
    const rank1 = board1.slice(56, 64).map(c => c?.type).join(',')
    const rank2 = board2.slice(56, 64).map(c => c?.type).join(',')
    expect(rank1).not.toBe(rank2)
  })

  test('drops flag sets config.drops on plugin', () => {
    const game = createGameForFamily('chess', { variant: 'standard+drops', rngSeed: 42 })
    const state = game.getState()
    expect(state.slice.hands).toBeDefined()
    expect(state.slice.hands).toEqual([[], []])
  })

  test('base variant without flags still works', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 42 })
    const state = game.getState()
    expect(state.slice.board[60]).toEqual({ type: 'king', owner: 0 })
  })
})
