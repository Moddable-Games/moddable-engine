export function createSimulator(plugin, opts = {}) {
  const playerCount = opts.playerCount || 2
  // A plugin may know how to score its own positions. Go, chess and the rest
  // register an evaluator by family name in the composition root; a family that
  // needs its own board geometry to evaluate at all - which is every connection
  // game - cannot, because the geometry lives in the plugin instance. Reading it
  // off the plugin costs nothing and closes that gap.
  const evaluate = opts.evaluate
    || (typeof plugin?.evaluate === 'function' ? (state, playerIndex) => plugin.evaluate(state, playerIndex) : null)
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

  // The search used to deep-copy the whole slice before every simulated move,
  // defending against a plugin that writes to the state it is handed. None of
  // them do: `applymove-is-pure.test.js` plays every playable variant and fails
  // if the slice a plugin was given comes back changed. A plugin that has been
  // held to that says so with `pureApplyMove`, and one that has not keeps the
  // copy.
  //
  // `structuredClone` was measured as a replacement and is SLOWER than the JSON
  // round trip on slices this small, between 0.3x and 1.8x depending on the
  // family. The saving is in not copying at all.
  const clonesDefensively = plugin?.pureApplyMove !== true

  function applyMove(state, move, playerIndex) {
    const working = clonesDefensively ? cloneState(state) : state
    const full = getFullState(working, playerIndex)
    const result = plugin.applyMove(move, working, full)

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

  // Whether the game is won, asked the way the game asks it: the move pipeline
  // calls checkWin before the turn passes, so `currentIndex` is the player who
  // just moved, and a plugin answers from that side - draughts asks whether the
  // mover's opponent has a move left. Asked from the side about to move, the
  // question was about the wrong player: a draughts position won by leaving the
  // opponent no move read as a draw, and the search walked past it.
  //
  // `scoring` means the game ends by counting the board. The evaluator counts
  // it where there is one; otherwise it is scored as a draw, not as a win for
  // seat 0, which is what reading a seat number out of the word gave.
  function winnerAfter(state, mover) {
    if (!plugin.checkWin || mover === undefined || mover === null) return null
    const result = plugin.checkWin(state, getFullState(state, mover))
    if (result === null || result === undefined) return null
    if (result === 'scoring') {
      if (!evaluate) return 'draw'
      const score = evaluate(state, mover)
      if (!Number.isFinite(score) || score === 0) return 'draw'
      return score > 0 ? mover : nextPlayer(mover, false)
    }
    return result
  }

  // `mover` is who made the move that reached `state`; without it, the player
  // before `playerIndex` in turn order.
  function checkTerminal(state, playerIndex, mover = (playerIndex + playerCount - 1) % playerCount) {
    const winner = winnerAfter(state, mover)

    if (winner !== null && winner !== undefined) {
      const winnerIndex = winner === 'draw' ? null : parseWinnerIndex(winner)
      return { over: true, winner, winnerIndex, score: scoreFromWinner(winner, playerIndex) }
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
    const cols = state._cols || state.cols || Math.round(Math.sqrt(size))
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

  // A plugin with a cheap win test of its own (chess) is asked that; any other
  // is asked its checkWin from the mover's side. Only chess had the former, so
  // minimax saw a win in chess and nowhere else.
  const checkWinConditionOnly = plugin.checkWinConditionOnly
    ? (state, playerIndex) => {
        const result = plugin.checkWinConditionOnly(state, playerIndex)
        if (result === null || result === undefined) return null
        return { over: true, score: scoreFromWinner(result, playerIndex) }
      }
    : plugin.checkWin
      ? (state, mover) => {
          const result = winnerAfter(state, mover)
          if (result === null || result === undefined) return null
          return { over: true, score: scoreFromWinner(result, mover) }
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
    plugin,
  }
}
