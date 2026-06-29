export function createPipeline(registry, store, history, playerSystem, eventBus) {

  function execute(move) {
    const fullState = store.getAll()
    const plugins = registry.getPlugins()

    // 1. Validate
    for (const plugin of plugins) {
      if (typeof plugin.validateMove === 'function') {
        const valid = plugin.validateMove(move, store.get(plugin.sliceName), fullState)
        if (valid === false) {
          return { ok: false, reason: `Rejected by ${plugin.sliceName}` }
        }
      }
    }

    // 2. Snapshot before
    const stateBefore = store.getAll()

    // 3. Apply
    for (const plugin of plugins) {
      if (typeof plugin.applyMove === 'function') {
        const newSlice = plugin.applyMove(move, store.get(plugin.sliceName), store.getAll())
        if (newSlice !== undefined) {
          store.set(plugin.sliceName, newSlice, plugin.sliceName)
        }
      }
    }

    // 4. Record
    const stateAfter = store.getAll()
    history.record(move, stateBefore, stateAfter)

    // 5. Check win
    let winner = null
    for (const plugin of plugins) {
      if (typeof plugin.checkWin === 'function') {
        const result = plugin.checkWin(store.get(plugin.sliceName), store.getAll())
        if (result !== null && result !== undefined) {
          winner = result
          break
        }
      }
    }

    // 6. Advance turn
    if (!winner) {
      playerSystem.advance(store)
    }

    // 7. Emit
    eventBus.emit('move.applied', { move, state: store.getAll(), winner })

    if (winner) {
      eventBus.emit('game.ended', { winner })
    }

    return { ok: true, winner }
  }

  function getLegalMoves() {
    const fullState = store.getAll()
    const plugins = registry.getPlugins()
    const allMoves = []
    for (const plugin of plugins) {
      if (typeof plugin.getLegalMoves === 'function') {
        const moves = plugin.getLegalMoves(store.get(plugin.sliceName), fullState)
        if (moves) allMoves.push(...moves)
      }
    }
    return allMoves
  }

  return { execute, getLegalMoves }
}
