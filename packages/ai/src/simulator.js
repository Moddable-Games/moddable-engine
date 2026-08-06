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

  const hasMakeUnmake = false

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
    let score = 0
    if (evaluate) {
      score = evaluate(state, playerIndex)
    } else {
      const terminal = checkTerminal(state, playerIndex)
      if (terminal.over) return terminal.score
    }
    score += pseudoMobility(state, playerIndex)
    return score
  }

  function pseudoMobility(state, playerIndex) {
    const board = state.board
    if (!board || !Array.isArray(board)) return 0
    const size = board.length
    const cols = state._cols || (size === 64 ? 8 : size === 81 ? 9 : size === 90 ? 9 : Math.round(Math.sqrt(size)))
    const rows = size / cols
    let myMobility = 0
    let oppMobility = 0
    for (let i = 0; i < size; i++) {
      const piece = board[i]
      if (!piece) continue
      const r = Math.floor(i / cols), c = i % cols
      const count = pseudoReach(piece.type, r, c, rows, cols, board, piece.owner)
      if (piece.owner === playerIndex) myMobility += count
      else oppMobility += count
    }
    return (myMobility - oppMobility) * 3
  }

  function pseudoReach(type, r, c, rows, cols, board, owner) {
    switch (type) {
      case 'pawn': return 2
      case 'knight': {
        let n = 0
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const nr = r + dr, nc = c + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) n++
        }
        return n
      }
      case 'king': return 8
      case 'rook': case 'chariot': case 'lance':
        return slideCount(r, c, rows, cols, board, [[0,1],[0,-1],[1,0],[-1,0]])
      case 'bishop': case 'fil':
        return slideCount(r, c, rows, cols, board, [[1,1],[1,-1],[-1,1],[-1,-1]])
      case 'queen': case 'chancellor': case 'archbishop': case 'amazon':
        return slideCount(r, c, rows, cols, board, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]])
      case 'gold': case 'silver': return 6
      default: return 4
    }
  }

  function slideCount(r, c, rows, cols, board, dirs) {
    let count = 0
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc
      while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        count++
        if (board[nr * cols + nc]) break
        nr += dr; nc += dc
      }
    }
    return count
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
