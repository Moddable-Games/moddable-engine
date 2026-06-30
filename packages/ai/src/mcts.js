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

      backpropagate(node, score)
    }

    if (root.children.length === 0) return null

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
    const idx = Math.floor(Math.random() * node.untriedMoves.length)
    const move = node.untriedMoves.splice(idx, 1)[0]
    const { state: newState, continueTurn } = simulator.applyMove(node.state, move, node.playerIndex)
    const nextPlayer = simulator.nextPlayer(node.playerIndex, continueTurn)
    const child = createNode(node, move, newState, nextPlayer)
    node.children.push(child)
    return child
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

      const randomMove = moves[Math.floor(Math.random() * moves.length)]
      const { state: newState, continueTurn } = simulator.applyMove(current, randomMove, player)
      current = newState
      player = simulator.nextPlayer(player, continueTurn)
      depth++
    }

    return 0.5
  }

  function evaluatedRollout(state, currentPlayer, rootPlayer) {
    const terminal = simulator.checkTerminal(state, currentPlayer)
    if (terminal.over) {
      if (terminal.winner === 'draw') return 0.5
      const winnerIdx = parseWinnerIndex(terminal.winner)
      return winnerIdx === rootPlayer ? 1 : 0
    }

    const score = simulator.evaluatePosition(state, rootPlayer)
    return (score + 1) / 2
  }

  function backpropagate(node, score) {
    while (node !== null) {
      node.visits++
      node.totalScore += score
      score = 1 - score
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
