export function createMinimax(simulator, opts = {}) {
  const maxDepth = opts.depth || 4
  const timeLimit = opts.timeLimit || null

  function search(state, playerIndex) {
    const moves = simulator.getLegalMoves(state, playerIndex)
    if (moves.length === 0) return null

    let bestMove = moves[0]
    let bestScore = -Infinity
    let startTime = timeLimit ? Date.now() : null

    for (const move of moves) {
      if (timeLimit && Date.now() - startTime > timeLimit) break

      const { state: newState, continueTurn } = simulator.applyMove(state, move, playerIndex)
      const nextPlayer = simulator.nextPlayer(playerIndex, continueTurn)
      const score = -negamax(newState, nextPlayer, playerIndex, maxDepth - 1, -Infinity, Infinity)

      if (score > bestScore) {
        bestScore = score
        bestMove = move
      }
    }

    return bestMove
  }

  function negamax(state, currentPlayer, maximizingPlayer, depth, alpha, beta) {
    const terminal = simulator.checkTerminal(state, currentPlayer)
    if (terminal.over) {
      return terminal.score * (currentPlayer === maximizingPlayer ? 1 : -1)
    }

    if (depth <= 0) {
      const eval_ = simulator.evaluatePosition(state, currentPlayer)
      return eval_ * (currentPlayer === maximizingPlayer ? 1 : -1)
    }

    const moves = simulator.getLegalMoves(state, currentPlayer)
    if (moves.length === 0) return 0

    let best = -Infinity
    for (const move of moves) {
      const { state: newState, continueTurn } = simulator.applyMove(state, move, currentPlayer)
      const nextPlayer = simulator.nextPlayer(currentPlayer, continueTurn)
      const score = -negamax(newState, nextPlayer, maximizingPlayer, depth - 1, -beta, -alpha)
      best = Math.max(best, score)
      alpha = Math.max(alpha, score)
      if (alpha >= beta) break
    }

    return best
  }

  return { search }
}
