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
        // Whether a move earns another turn can depend on the position BEFORE
        // it is applied. Kalah's rule is that a last seed landing in your own
        // store means you go again, and once the move has been applied there is
        // no longer a "before" to ask about, so the plugin is asked first.
        //
        // `continuesTurn` was implemented on the mancala plugin, declared in
        // kalah's and congkak's frontmatter as `bonusTurnOnStore: true`, and
        // called by nothing at all. The rule simply did not happen: the turn
        // passed to the opponent every time, in every variant that has it.
        if (typeof plugin.continuesTurn === 'function') {
          try {
            if (plugin.continuesTurn(move, store.get(plugin.sliceName), store.getAll())) continueTurn = true
          } catch (err) {
            console.warn(`[move-pipeline] ${plugin.sliceName}.continuesTurn threw:`, err)
          }
        }
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

    // 5. Turn effects, then the win test.
    //
    // `checkWin` answers one question: is the game over. A variant may need to
    // change who commands what, or who plays next, on a move that ends
    // nothing - Djambi's centre cell grants its holder a turn between each of
    // the others', and that has to be kept current every move. Folding those
    // into `checkWin` made it return a non-null object on an ordinary move,
    // and every caller reading `checkWin() != null` as "finished" believed it.
    for (const plugin of plugins) {
      if (typeof plugin.turnEffects !== 'function') continue
      const effects = plugin.turnEffects(store.get(plugin.sliceName), store.getAll())
      if (!effects) continue
      if ('interleave' in effects) playerSystem.setInterleaved(effects.interleave, store)
      if ('eliminate' in effects) {
        playerSystem.eliminate(effects.eliminate, store)
        if (effects.controlTo !== undefined && effects.controlTo !== null) {
          playerSystem.setControl(effects.eliminate, effects.controlTo, store)
        }
      }
    }

    // 5. Check win
    let winner = null
    for (const plugin of plugins) {
      if (typeof plugin.checkWin === 'function') {
        const result = plugin.checkWin(store.get(plugin.sliceName), store.getAll())
        if (result !== null && result !== undefined) {
          if (typeof result === 'object' && result !== null && 'eliminate' in result) {
            playerSystem.eliminate(result.eliminate, store)
            if (result.controlTo !== undefined && result.controlTo !== null) {
              playerSystem.setControl(result.eliminate, result.controlTo, store)
            }
            if (playerSystem.getActiveCount(store) === 1) {
              const players = playerSystem.getAll()
              winner = players.findIndex((_, i) => !playerSystem.isEliminated(i, store))
            }
          } else {
            winner = result
          }
          break
        }
      }
    }

    // 6. Advance turn — only if no plugin signalled continueTurn and no winner
    if (winner === null && !continueTurn) {
      playerSystem.advance(store)
    }

    // 7. Emit
    eventBus.emit('move.applied', { move, state: store.getAll(), winner, continueTurn })

    if (winner !== null) {
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
