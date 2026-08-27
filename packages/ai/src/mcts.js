const DIFFICULTIES = {
  beginner: { iterations: 100, timeMs: 200, exploration: 2.0 },
  easy: { iterations: 300, timeMs: 400, exploration: 1.8 },
  medium: { iterations: 800, timeMs: 800, exploration: 1.41 },
  hard: { iterations: 2000, timeMs: 1500, exploration: 1.2 },
  expert: { iterations: 5000, timeMs: 3000, exploration: 1.0 },
}

export function createMCTS(simulator, opts = {}) {
  const difficulty = opts.difficulty || null
  const config = difficulty ? DIFFICULTIES[difficulty] : {}
  const iterations = opts.iterations || config.iterations || 1000
  const timeMs = opts.timeMs || config.timeMs || null
  const explorationConstant = opts.exploration || config.exploration || 1.41
  const maxRolloutDepth = opts.maxRolloutDepth || 100

  const evaluate = opts.evaluate || null
  const rolloutPolicy = opts.rolloutPolicy || null
  const expansionPolicy = opts.expansionPolicy || null

  function search(state, playerIndex) {
    const root = createNode(null, null, state, playerIndex)
    const deadline = timeMs ? Date.now() + timeMs : null
    let completed = 0

    for (let i = 0; i < iterations; i++) {
      if (deadline && Date.now() >= deadline) break
      completed++

      let node = root

      while (node.untriedMoves.length === 0 && node.children.length > 0) {
        node = selectChild(node)
      }

      if (node.untriedMoves.length > 0) {
        node = expand(node)
      }

      const score = evaluate
        ? evaluatedRollout(node.state, node.playerIndex, playerIndex)
        : randomRollout(node.state, node.playerIndex, playerIndex)

      backpropagate(node, score, playerIndex)
    }

    if (root.children.length === 0) {
      return root.untriedMoves.length > 0 ? root.untriedMoves[0] : null
    }

    let bestChild = root.children[0]
    let bestVisits = bestChild.visits
    for (const child of root.children) {
      if (child.visits > bestVisits) {
        bestChild = child
        bestVisits = child.visits
      }
    }

    return bestChild.move
  }

  function createNode(parent, move, state, playerIndex) {
    const moves = simulator.getLegalMoves(state, playerIndex)
    return {
      parent,
      move,
      state,
      playerIndex,
      children: [],
      untriedMoves: [...moves],
      visits: 0,
      totalScore: 0,
    }
  }

  function selectChild(node) {
    let best = null
    let bestUCB = -Infinity

    for (const child of node.children) {
      const exploitation = child.totalScore / child.visits
      const exploration = explorationConstant * Math.sqrt(Math.log(node.visits) / child.visits)
      const ucb = exploitation + exploration
      if (ucb > bestUCB) {
        bestUCB = ucb
        best = child
      }
    }

    return best
  }

  function expand(node) {
    let idx
    if (expansionPolicy && node.untriedMoves.length > 1) {
      idx = weightedExpansionPick(node.untriedMoves, node.state, node.playerIndex)
    } else {
      idx = Math.floor(Math.random() * node.untriedMoves.length)
    }
    const move = node.untriedMoves.splice(idx, 1)[0]
    const { state: newState, continueTurn } = simulator.applyMove(node.state, move, node.playerIndex)
    const nextPlayer = simulator.nextPlayer(node.playerIndex, continueTurn)
    const child = createNode(node, move, newState, nextPlayer)
    node.children.push(child)
    return child
  }

  function weightedExpansionPick(moves, state, playerIndex) {
    const weights = expansionPolicy(state, playerIndex, moves)
    let total = 0
    for (let i = 0; i < weights.length; i++) total += weights[i]
    if (total <= 0) return Math.floor(Math.random() * moves.length)
    let r = Math.random() * total
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r <= 0) return i
    }
    return moves.length - 1
  }

  function randomRollout(state, currentPlayer, rootPlayer) {
    let current = simulator.cloneState(state)
    let player = currentPlayer
    let depth = 0

    while (depth < maxRolloutDepth) {
      const terminal = simulator.checkTerminal(current, player)
      if (terminal.over) {
        if (terminal.winner === 'draw') return 0.5
        const winnerIdx = parseWinnerIndex(terminal.winner)
        return winnerIdx === rootPlayer ? 1 : 0
      }

      const moves = simulator.getLegalMoves(current, player)
      if (moves.length === 0) return 0.5

      const selectedMove = rolloutPolicy
        ? rolloutPolicy(current, player, moves)
        : moves[Math.floor(Math.random() * moves.length)]
      const { state: newState, continueTurn } = simulator.applyMove(current, selectedMove, player)
      current = newState
      player = simulator.nextPlayer(player, continueTurn)
      depth++
    }

    // The rollout ran out of depth before the game ended. Returning 0.5 says
    // "an even position", which is a claim about the position rather than an
    // admission that we did not find out - and every such rollout is a vote
    // for nothing in particular. Where the simulator can score the position,
    // scoring it is strictly more information than a shrug.
    return truncatedValue(current, rootPlayer)
  }

  // Both the truncation fallback and the evaluated rollout land here, so a
  // position is worth the same number whichever way the search arrived at it.
  function truncatedValue(state, rootPlayer) {
    const score = simulator.evaluatePosition(state, rootPlayer)
    if (!Number.isFinite(score)) return 0.5
    return Math.max(0, Math.min(1, (score + 1) / 2))
  }

  function evaluatedRollout(state, currentPlayer, rootPlayer) {
    const terminal = simulator.checkTerminal(state, currentPlayer)
    if (terminal.over) {
      if (terminal.winner === 'draw') return 0.5
      const winnerIdx = parseWinnerIndex(terminal.winner)
      return winnerIdx === rootPlayer ? 1 : 0
    }

    return truncatedValue(state, rootPlayer)
  }

  // A node's score is kept from the point of view of whoever moved into it,
  // because that is the player `selectChild` is choosing for when it reads the
  // node's average without negating it.
  //
  // This used to flip the score once per level on the way up, starting from
  // the expanded node - which is only the same thing when the players strictly
  // alternate AND the value handed in belongs to the expanded node's parent.
  // Neither held. The rollout returns a value for the player at the root, so
  // odd depths were scored correctly and even depths were scored inverted: the
  // search was rewarding half its own tree for the opponent's good positions.
  // And a game where one player moves twice in a row - which the simulator
  // supports through `continueTurn` - broke the alternation the flip assumed.
  //
  // Asking each node who moved into it removes both assumptions.
  function backpropagate(node, rootScore, rootPlayer) {
    while (node !== null) {
      node.visits++
      const mover = node.parent ? node.parent.playerIndex : rootPlayer
      node.totalScore += mover === rootPlayer ? rootScore : 1 - rootScore
      node = node.parent
    }
  }

  function parseWinnerIndex(winner) {
    if (typeof winner === 'number') return winner
    const match = String(winner).match(/(\d+)/)
    if (match) return parseInt(match[1], 10) - 1
    return 0
  }

  return { search }
}

export { DIFFICULTIES as MCTS_DIFFICULTIES }
