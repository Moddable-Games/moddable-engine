import { createPipeline } from '../src/move-pipeline.js'
import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'
import { createHistory } from '../src/history.js'
import { createPlayerSystem } from '../src/player-system.js'
import { createEventBus } from '../src/event-bus.js'

describe('move-pipeline', () => {
  let registry, store, history, playerSystem, eventBus, pipeline

  const counterPlugin = {
    sliceName: 'counter',
    init: () => ({ value: 0 }),
    validateMove: (move) => move.amount > 0,
    applyMove: (move, slice) => ({ value: slice.value + move.amount }),
    getLegalMoves: (slice) => [{ amount: 1 }, { amount: 2 }],
    checkWin: (slice) => slice.value >= 10 ? 'player1' : null,
  }

  beforeEach(() => {
    registry = createRegistry()
    registry.register(counterPlugin)
    playerSystem = createPlayerSystem({ players: ['player1', 'player2'] })
    store = createStore({})
    registry.initAll({ counter: {} }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    eventBus = createEventBus()
    pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  })

  test('execute applies valid move', () => {
    const result = pipeline.execute({ amount: 3 })
    expect(result.ok).toBe(true)
    expect(store.get('counter')).toEqual({ value: 3 })
  })

  test('execute rejects invalid move', () => {
    const result = pipeline.execute({ amount: -1 })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('counter')
  })

  test('execute advances turn', () => {
    pipeline.execute({ amount: 1 })
    expect(playerSystem.current(store)).toBe('player2')
  })

  test('execute records to history', () => {
    pipeline.execute({ amount: 1 })
    expect(history.length()).toBe(1)
  })

  test('execute detects winner', () => {
    const result = pipeline.execute({ amount: 10 })
    expect(result.winner).toBe('player1')
  })

  test('execute does not advance turn on win', () => {
    pipeline.execute({ amount: 10 })
    expect(playerSystem.current(store)).toBe('player1')
  })

  test('execute emits move.applied', () => {
    const events = []
    eventBus.on('move.applied', (e) => events.push(e))
    pipeline.execute({ amount: 1 })
    expect(events).toHaveLength(1)
    expect(events[0].move).toEqual({ amount: 1 })
  })

  test('execute emits game.ended on win', () => {
    const events = []
    eventBus.on('game.ended', (e) => events.push(e))
    pipeline.execute({ amount: 10 })
    expect(events).toHaveLength(1)
    expect(events[0].winner).toBe('player1')
  })

  test('getLegalMoves returns plugin moves', () => {
    const moves = pipeline.getLegalMoves()
    expect(moves).toEqual([{ amount: 1 }, { amount: 2 }])
  })

  test('undo after execute restores state', () => {
    pipeline.execute({ amount: 5 })
    history.undo(store)
    expect(store.get('counter')).toEqual({ value: 0 })
  })

  test('multiple moves accumulate', () => {
    pipeline.execute({ amount: 3 })
    pipeline.execute({ amount: 4 })
    expect(store.get('counter')).toEqual({ value: 7 })
  })

  test('continueTurn prevents turn advancement', () => {
    const contRegistry = createRegistry()
    contRegistry.register({
      sliceName: 'multi',
      init: () => ({ steps: 0, remaining: 0 }),
      validateMove: () => true,
      applyMove: (move, slice) => {
        const remaining = move.start ? move.count - 1 : slice.remaining - 1
        return { state: { steps: slice.steps + 1, remaining }, continueTurn: remaining > 0 }
      },
      getLegalMoves: () => [{ step: true }],
      checkWin: () => null,
    })
    const ps = createPlayerSystem({ players: ['a', 'b'] })
    const s = createStore({})
    contRegistry.initAll({ multi: {} }, s)
    s.set(ps.sliceName, ps.initState())
    const h = createHistory()
    const eb = createEventBus()
    const p = createPipeline(contRegistry, s, h, ps, eb)

    const r1 = p.execute({ start: true, count: 3 })
    expect(r1.continueTurn).toBe(true)
    expect(ps.current(s)).toBe('a')

    const r2 = p.execute({ step: true })
    expect(r2.continueTurn).toBe(true)
    expect(ps.current(s)).toBe('a')

    const r3 = p.execute({ step: true })
    expect(r3.continueTurn).toBe(false)
    expect(ps.current(s)).toBe('b')
  })
})
