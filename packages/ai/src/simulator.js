export function createSimulator(plugin, opts = {}) {
  const playerCount = opts.playerCount || 2
  const evaluate = opts.evaluate || null
  const playerNames = opts.playerNames || null

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state))
  }

  function getFullState(slice, currentIndex) {
    return { __players: { currentIndex, count: playerCount }, [plugin.sliceName]: slice }
  }

  function getLegalMoves(state, playerIndex) {
    const full = getFullState(state, playerIndex)
    return plugin.getLegalMoves(state, full)
  }

  function applyMove(state, move, playerIndex) {
    const cloned = cloneState(state)
    const full = getFullState(cloned, playerIndex)
    const result = plugin.applyMove(move, cloned, full)

    if (result && typeof result === 'object' && 'state' in result) {
      return {
        state: result.state,
        continueTurn: !!result.continueTurn,
      }
    }

    return {
      state: result,
      continueTurn: false,
    }
  }

  const hasMakeUnmake = !!(plugin.searchMakeMove && plugin.searchUnmakeMove)

  function makeMove(state, move, playerIndex) {
    return plugin.searchMakeMove(state, move, playerIndex)
  }

  function unmakeMove(state, move, undo) {
    plugin.searchUnmakeMove(state, move, undo)
  }

  function checkTerminal(state, playerIndex) {
    const full = getFullState(state, playerIndex)
    const winner = plugin.checkWin(state, full)

    if (winner !== null && winner !== undefined) {
      return { over: true, winner, score: scoreFromWinner(winner, playerIndex) }
    }

    const moves = getLegalMoves(state, playerIndex)
    if (moves.length === 0) {
      return { over: true, winner: null, score: 0 }
    }

    return { over: false, winner: null, score: null }
  }

  function checkWinOnly(state, playerIndex) {
    if (!plugin.checkWin) return null
    const full = getFullState(state, playerIndex)
    return plugin.checkWin(state, full)
  }

  function evaluatePosition(state, playerIndex) {
    if (evaluate) return evaluate(state, playerIndex)

    const terminal = checkTerminal(state, playerIndex)
    if (terminal.over) return terminal.score

    return 0
  }

  function nextPlayer(playerIndex, continueTurn) {
    if (continueTurn) return playerIndex
    return (playerIndex + 1) % playerCount
  }

  function scoreFromWinner(winner, playerIndex) {
    if (winner === 'draw') return 0
    const winnerIdx = parseWinnerIndex(winner)
    if (winnerIdx === playerIndex) return 1
    return -1
  }

  function parseWinnerIndex(winner) {
    if (typeof winner === 'number') return winner

    const name = String(winner)
    if (playerNames) {
      const named = playerNames.indexOf(name)
      if (named !== -1) return named
    }

    const match = name.match(/(\d+)/)
    if (match) return parseInt(match[1], 10) - 1
    return 0
  }

  const positionKey = plugin.positionKey
    ? (state, playerIndex) => plugin.positionKey(state, playerIndex)
    : null

  const isInCheck = plugin.isInCheck
    ? (state, playerIndex) => plugin.isInCheck(state.board, playerIndex)
    : null

  const checkWinConditionOnly = plugin.checkWinConditionOnly
    ? (state, playerIndex) => {
        const result = plugin.checkWinConditionOnly(state, playerIndex)
        if (result === null || result === undefined) return null
        return { over: true, score: scoreFromWinner(result, playerIndex) }
      }
    : null

  return {
    getLegalMoves,
    applyMove,
    checkTerminal,
    evaluatePosition,
    nextPlayer,
    cloneState,
    positionKey,
    isInCheck,
    checkWinConditionOnly,
    hasMakeUnmake,
    makeMove: hasMakeUnmake ? makeMove : null,
    unmakeMove: hasMakeUnmake ? unmakeMove : null,
    playerCount,
    playerNames,
  }
}
