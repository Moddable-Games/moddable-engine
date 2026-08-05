import '../test-helpers/setup-rules-reader.js'
import { createSimulatorForFamily } from '../src/simulator-helper.js'
import { createGameForFamily } from '../src/play.js'
import '../../plugins/chess/index.js'
import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'

describe('createSimulatorForFamily', () => {
  it('creates a simulator for chess with correct interface', () => {
    const sim = createSimulatorForFamily('chess')
    expect(typeof sim.getLegalMoves).toBe('function')
    expect(typeof sim.applyMove).toBe('function')
    expect(typeof sim.checkTerminal).toBe('function')
    expect(typeof sim.evaluatePosition).toBe('function')
    expect(typeof sim.nextPlayer).toBe('function')
    expect(typeof sim.cloneState).toBe('function')
    expect(sim.playerCount).toBe(2)
  })

  it('chess simulator returns legal moves from initial state', () => {
    const sim = createSimulatorForFamily('chess')
    const game = createGameForFamily('chess')
    const state = game.getState().slice
    const moves = sim.getLegalMoves(state, 0)
    expect(moves.length).toBe(20)
  })

  it('creates simulator for go with evaluator', () => {
    const sim = createSimulatorForFamily('go', null, { variant: '9x9' })
    expect(sim.playerCount).toBe(2)
    expect(typeof sim.evaluatePosition).toBe('function')
  })

  it('creates simulator for draughts', () => {
    const sim = createSimulatorForFamily('draughts')
    expect(sim.playerCount).toBe(2)
  })

  it('throws for unknown family', () => {
    expect(() => createSimulatorForFamily('boggle')).toThrow(/Unknown game family/)
  })

  it('loads provided state', () => {
    const game = createGameForFamily('chess')
    const move = game.getLegalMoves()[0]
    game.applyMove(move)
    const state = game.getState()

    const sim = createSimulatorForFamily('chess', state)
    const moves = sim.getLegalMoves(state.slice, 1)
    expect(moves.length).toBe(20)
  })

  it('accepts custom evaluator', () => {
    const custom = () => 42
    const sim = createSimulatorForFamily('chess', null, { evaluate: custom })
    const game = createGameForFamily('chess')
    const state = game.getState().slice
    expect(sim.evaluatePosition(state, 0)).toBe(42)
  })
})
