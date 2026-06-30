const TT_EXACT = 0
const TT_LOWER = 1
const TT_UPPER = 2
const TT_SIZE = 1 << 18

const DIFFICULTIES = {
  beginner: { timeMs: 200, maxDepth: 2, topN: 5, spread: 0.5 },
  easy: { timeMs: 400, maxDepth: 3, topN: 4, spread: 1.0 },
  medium: { timeMs: 800, maxDepth: 5, topN: 3, spread: 2.0 },
  hard: { timeMs: 1500, maxDepth: 5, topN: 1, spread: 0 },
  expert: { timeMs: 3000, maxDepth: 50, topN: 1, spread: 0 },
}

export function createMinimax(simulator, opts = {}) {
  const difficulty = opts.difficulty || 'medium'
  const config = DIFFICULTIES[difficulty] || opts
  const maxDepth = opts.depth || config.maxDepth || 5
  const timeMs = opts.timeLimit || config.timeMs || 800
  const topN = opts.topN !== undefined ? opts.topN : config.topN || 1
  const spread = opts.spread !== undefined ? opts.spread : config.spread || 0
  const boardSizeLimit = opts.boardSizeLimit !== undefined ? opts.boardSizeLimit : true

  const orderMoves = opts.orderMoves || null
  const isCapture = opts.isCapture || defaultIsCapture
  const isQuiet = opts.isQuiet || null

  let tt = new Array(TT_SIZE).fill(null)
  let ttGeneration = 0
  let deadline = 0
  let nodesSearched = 0

  function search(state, playerIndex) {
    ttGeneration++
    deadline = Date.now() + timeMs
    nodesSearched = 0

    const moves = simulator.getLegalMoves(state, playerIndex)
    if (moves.length === 0) return null
    if (moves.length === 1) return moves[0]

    const effectiveMaxDepth = getEffectiveDepth(state, maxDepth)
    let bestResults = moves.map(m => ({ move: m, score: -Infinity }))

    for (let depth = 1; depth <= effectiveMaxDepth; depth++) {
      if (Date.now() >= deadline) break

      const depthResults = []
      let aborted = false

      for (const move of orderedMoves(moves, bestResults)) {
        if (Date.now() >= deadline) { aborted = true; break }

        const { state: newState, continueTurn } = simulator.applyMove(state, move, playerIndex)
        const nextPlayer = simulator.nextPlayer(playerIndex, continueTurn)
        const score = -negamax(newState, nextPlayer, playerIndex, depth - 1, -Infinity, Infinity)
        depthResults.push({ move, score })
      }

      if (!aborted && depthResults.length === moves.length) {
        bestResults = depthResults.sort((a, b) => b.score - a.score)
      }

      if (bestResults[0].score >= 90000) break
    }

    return selectMove(bestResults, topN, spread)
  }

  function negamax(state, currentPlayer, maximizingPlayer, depth, alpha, beta) {
    nodesSearched++
    if (Date.now() >= deadline) return 0

    const terminal = simulator.checkTerminal(state, currentPlayer)
    if (terminal.over) {
      return terminal.score * (currentPlayer === maximizingPlayer ? 100000 : -100000)
    }

    if (depth <= 0) {
      if (isQuiet) {
        return quiesce(state, currentPlayer, maximizingPlayer, alpha, beta, 6)
      }
      const eval_ = simulator.evaluatePosition(state, currentPlayer)
      return eval_ * (currentPlayer === maximizingPlayer ? 1 : -1) * 1000
    }

    const hash = hashState(state, currentPlayer)
    const ttIdx = hash & (TT_SIZE - 1)
    const ttEntry = tt[ttIdx]
    let ttBestMove = null

    if (ttEntry && ttEntry.key === hash && ttEntry.gen === ttGeneration) {
      if (ttEntry.depth >= depth) {
        if (ttEntry.flag === TT_EXACT) return ttEntry.score
        if (ttEntry.flag === TT_LOWER && ttEntry.score >= beta) return ttEntry.score
        if (ttEntry.flag === TT_UPPER && ttEntry.score <= alpha) return ttEntry.score
      }
      ttBestMove = ttEntry.bestMove
    }

    const moves = simulator.getLegalMoves(state, currentPlayer)
    if (moves.length === 0) return 0

    const ordered = orderMovesForSearch(moves, ttBestMove, state, currentPlayer)
    let best = -Infinity
    let bestMove = ordered[0]
    let flag = TT_UPPER

    for (const move of ordered) {
      if (Date.now() >= deadline) break

      const { state: newState, continueTurn } = simulator.applyMove(state, move, currentPlayer)
      const nextPlayer = simulator.nextPlayer(currentPlayer, continueTurn)
      const score = -negamax(newState, nextPlayer, maximizingPlayer, depth - 1, -beta, -alpha)

      if (score > best) {
        best = score
        bestMove = move
      }

      if (score > alpha) {
        alpha = score
        flag = TT_EXACT
      }

      if (alpha >= beta) {
        flag = TT_LOWER
        break
      }
    }

    tt[ttIdx] = { key: hash, depth, score: best, flag, bestMove, gen: ttGeneration }
    return best
  }

  function quiesce(state, currentPlayer, maximizingPlayer, alpha, beta, maxQuiesce) {
    const standPat = simulator.evaluatePosition(state, currentPlayer) *
      (currentPlayer === maximizingPlayer ? 1 : -1) * 1000

    if (standPat >= beta) return standPat
    if (standPat > alpha) alpha = standPat
    if (maxQuiesce <= 0) return standPat

    const moves = simulator.getLegalMoves(state, currentPlayer)
    const captures = moves.filter(m => isCapture(m, state))
    if (captures.length === 0) return standPat

    for (const move of captures) {
      if (Date.now() >= deadline) break

      const { state: newState, continueTurn } = simulator.applyMove(state, move, currentPlayer)
      const nextPlayer = simulator.nextPlayer(currentPlayer, continueTurn)
      const score = -quiesce(newState, nextPlayer, maximizingPlayer, -beta, -alpha, maxQuiesce - 1)

      if (score >= beta) return score
      if (score > alpha) alpha = score
    }

    return alpha
  }

  function orderMovesForSearch(moves, ttBestMove, state, playerIndex) {
    if (orderMoves) return orderMoves(moves, state, playerIndex, ttBestMove)

    return moves.slice().sort((a, b) => {
      const scoreA = moveOrderScore(a, ttBestMove)
      const scoreB = moveOrderScore(b, ttBestMove)
      return scoreB - scoreA
    })
  }

  function moveOrderScore(move, ttBestMove) {
    if (ttBestMove && movesEqual(move, ttBestMove)) return 100000
    if (isCapture(move)) return 10000
    if (move.promote) return 9000
    if (move.castle) return 500
    return 0
  }

  function orderedMoves(moves, previousResults) {
    if (!previousResults || previousResults[0].score === -Infinity) return moves
    return previousResults.map(r => r.move)
  }

  function selectMove(scored, n, temperature) {
    const pool = scored.slice(0, Math.min(n, scored.length))
    if (pool.length <= 1 || temperature <= 0) return pool[0].move

    const best = pool[0].score
    const weights = pool.map(entry => {
      const diff = best - entry.score
      return Math.exp(-diff / (temperature * 100))
    })

    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let random = Math.random() * totalWeight
    for (let i = 0; i < pool.length; i++) {
      random -= weights[i]
      if (random <= 0) return pool[i].move
    }
    return pool[pool.length - 1].move
  }

  function getEffectiveDepth(state, baseDepth) {
    if (!boardSizeLimit) return baseDepth
    const moves = simulator.getLegalMoves(state, 0)
    const branchingFactor = moves.length
    if (branchingFactor > 80) return Math.min(baseDepth, 3)
    if (branchingFactor > 40) return Math.min(baseDepth, 4)
    if (branchingFactor > 20) return Math.min(baseDepth, 6)
    return baseDepth
  }

  function hashState(state, playerIndex) {
    const str = JSON.stringify(state) + playerIndex
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
    }
    return hash >>> 0
  }

  function movesEqual(a, b) {
    if (a === b) return true
    if (!a || !b) return false
    return JSON.stringify(a) === JSON.stringify(b)
  }

  function clearTT() {
    tt = new Array(TT_SIZE).fill(null)
  }

  function getStats() {
    return { nodesSearched, ttGeneration }
  }

  return { search, clearTT, getStats }
}

function defaultIsCapture(move) {
  return !!(move.captures && move.captures.length > 0) || !!move.capture
}

export { DIFFICULTIES }
