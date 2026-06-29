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

    // 3. Apply — plugins return new slice state, or { state, continueTurn }
    let continueTurn = false
    for (const plugin of plugins) {
      if (typeof plugin.applyMove === 'function') {
        const result = plugin.applyMove(move, store.get(plugin.sliceName), store.getAll())
        if (result === undefined) continue
        if (result !== null && typeof result === 'object' && 'state' in result) {
          store.set(plugin.sliceName, result.state, plugin.sliceName)
          if (result.continueTurn) continueTurn = true
        } else {
          store.set(plugin.sliceName, result, plugin.sliceName)
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

    // 6. Advance turn — only if no plugin signalled continueTurn and no winner
    if (!winner && !continueTurn) {
      playerSystem.advance(store)
    }

    // 7. Emit
    eventBus.emit('move.applied', { move, state: store.getAll(), winner, continueTurn })

    if (winner) {
      eventBus.emit('game.ended', { winner })
    }

    return { ok: true, winner, continueTurn }
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
