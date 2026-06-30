export function createMCTS(simulator, opts = {}) {
  const iterations = opts.iterations || 1000
  const explorationConstant = opts.exploration || 1.41

  function search(state, playerIndex) {
    const root = createNode(null, null, state, playerIndex)

    for (let i = 0; i < iterations; i++) {
      let node = root

      while (node.untriedMoves.length === 0 && node.children.length > 0) {
        node = selectChild(node)
      }

      if (node.untriedMoves.length > 0) {
        node = expand(node)
      }

      const score = rollout(node.state, node.playerIndex, playerIndex)
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

  function rollout(state, currentPlayer, rootPlayer) {
    let current = simulator.cloneState(state)
    let player = currentPlayer
    let depth = 0
    const maxDepth = 100

    while (depth < maxDepth) {
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
