const TT_EXACT = 0
const TT_LOWER = 1
const TT_UPPER = 2
const TT_SIZE = 1 << 18

const PIECE_ORDER = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000, archbishop: 650, chancellor: 830 }

function historyIndex(move) {
  const from = (move.from !== undefined ? move.from : 0) & 63
  const to = (move.to !== undefined ? move.to : 0) & 63
  return (from << 6) | to
}

const DIFFICULTIES = {
  beginner: { timeMs: 200, maxDepth: 2, topN: 5, spread: 0.5 },
  easy: { timeMs: 400, maxDepth: 3, topN: 4, spread: 1.0 },
  medium: { timeMs: 800, maxDepth: 5, topN: 3, spread: 1.0 },
  hard: { timeMs: 1500, maxDepth: 7, topN: 2, spread: 0 },
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
  const openingBook = opts.openingBook || null

  let tt = new Array(TT_SIZE).fill(null)
  let ttGeneration = 0
  let deadline = 0
  let nodesSearched = 0

  const killers = new Array(64).fill(null).map(() => [null, null])
  const history = new Int32Array(4096)

  function resetSearchState() {
    for (let i = 0; i < 64; i++) { killers[i][0] = null; killers[i][1] = null }
    history.fill(0)
  }

  function probeBook(state, playerIndex, moves) {
    if (!openingBook || !simulator.positionKey) return null
    const key = simulator.positionKey(state, playerIndex)
    const entries = openingBook[key]
    if (!entries || entries.length === 0) return null
    const notation = entries[Math.floor(Math.random() * entries.length)]
    const fromCol = notation.charCodeAt(0) - 97
    const fromRow = 8 - parseInt(notation[1])
    const toCol = notation.charCodeAt(2) - 97
    const toRow = 8 - parseInt(notation[3])
    const from = fromRow * 8 + fromCol
    const to = toRow * 8 + toCol
    const promo = notation.length > 4 ? notation[4] : null
    for (const m of moves) {
      if (m.from === from && m.to === to) {
        if (promo && m.promotion !== promo) continue
        return m
      }
    }
    return null
  }

  function search(state, playerIndex) {
    ttGeneration++
    deadline = Date.now() + timeMs
    nodesSearched = 0
    resetSearchState()

    const useMakeUnmake = simulator.hasMakeUnmake
    const scratch = useMakeUnmake ? simulator.cloneState(state) : state

    let moves
    try {
      moves = simulator.getLegalMoves(scratch, playerIndex)
    } catch (e) {
      return null
    }
    if (!moves || moves.length === 0) return null
    if (moves.length === 1) return moves[0]

    const bookMove = probeBook(scratch, playerIndex, moves)
    if (bookMove) return bookMove

    const effectiveMaxDepth = getEffectiveDepth(scratch, maxDepth)
    let bestResults = moves.map(m => ({ move: m, score: -Infinity }))

    for (let depth = 1; depth <= effectiveMaxDepth; depth++) {
      if (Date.now() >= deadline) break

      const depthResults = []
      let aborted = false
      let alpha = -Infinity
      const beta = Infinity

      for (const move of orderedMoves(moves, bestResults)) {
        if (Date.now() >= deadline) { aborted = true; break }

        let score
        if (useMakeUnmake) {
          const undo = simulator.makeMove(scratch, move, playerIndex)
          const nextPlayer = simulator.nextPlayer(playerIndex, false)
          score = -negamax(scratch, nextPlayer, playerIndex, depth - 1, -beta, -alpha, 1)
          simulator.unmakeMove(scratch, move, undo)
        } else {
          const { state: newState, continueTurn } = simulator.applyMove(scratch, move, playerIndex)
          const nextPlayer = simulator.nextPlayer(playerIndex, continueTurn)
          score = -negamax(newState, nextPlayer, playerIndex, depth - 1, -beta, -alpha, 1)
        }
        depthResults.push({ move, score })
        if (score > alpha) alpha = score
      }

      if (!aborted && depthResults.length === moves.length) {
        bestResults = depthResults.sort((a, b) => b.score - a.score)
      }

      if (bestResults[0].score >= 90000) break
    }

    const result = selectMove(bestResults, topN, spread)
    return result || moves[0]
  }

  function negamax(state, currentPlayer, maximizingPlayer, depth, alpha, beta, ply) {
    nodesSearched++
    if (Date.now() >= deadline) return 0

    if (simulator.checkWinConditionOnly) {
      const prevPlayer = (currentPlayer + simulator.playerCount - 1) % simulator.playerCount
      const win = simulator.checkWinConditionOnly(state, prevPlayer)
      if (win) {
        const winnerIsMe = win.score > 0
        return winnerIsMe ? -100000 : 100000
      }
    }

    if (depth <= 0) {
      return quiesce(state, currentPlayer, maximizingPlayer, alpha, beta, 2)
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
    if (moves.length === 0) {
      if (simulator.isInCheck && simulator.isInCheck(state, currentPlayer)) {
        return -100000
      }
      return 0
    }

    const safePly = ply < 64 ? ply : 63
    const ordered = orderMovesForSearch(moves, ttBestMove, state, currentPlayer, safePly)
    let best = -Infinity
    let bestMove = ordered[0]
    let flag = TT_UPPER

    if (simulator.hasMakeUnmake) {
      for (const move of ordered) {
        if (Date.now() >= deadline) break
        const undo = simulator.makeMove(state, move, currentPlayer)
        const nextPlayer = simulator.nextPlayer(currentPlayer, false)
        const score = -negamax(state, nextPlayer, maximizingPlayer, depth - 1, -beta, -alpha, ply + 1)
        simulator.unmakeMove(state, move, undo)

        if (score > best) { best = score; bestMove = move }
        if (score > alpha) { alpha = score; flag = TT_EXACT }
        if (alpha >= beta) {
          flag = TT_LOWER
          if (!isCapture(move, state.board)) {
            if (!movesEqual(move, killers[safePly][0])) {
              killers[safePly][1] = killers[safePly][0]
              killers[safePly][0] = move
            }
            history[historyIndex(move)] += depth * depth
          }
          break
        }
      }
    } else {
      for (const move of ordered) {
        if (Date.now() >= deadline) break
        const { state: newState, continueTurn } = simulator.applyMove(state, move, currentPlayer)
        const nextPlayer = simulator.nextPlayer(currentPlayer, continueTurn)
        const score = -negamax(newState, nextPlayer, maximizingPlayer, depth - 1, -beta, -alpha, ply + 1)

        if (score > best) { best = score; bestMove = move }
        if (score > alpha) { alpha = score; flag = TT_EXACT }
        if (alpha >= beta) {
          flag = TT_LOWER
          if (!isCapture(move)) {
            if (!movesEqual(move, killers[safePly][0])) {
              killers[safePly][1] = killers[safePly][0]
              killers[safePly][0] = move
            }
            history[historyIndex(move)] += depth * depth
          }
          break
        }
      }
    }

    tt[ttIdx] = { key: hash, depth, score: best, flag, bestMove, gen: ttGeneration }
    return best
  }

  function quiesce(state, currentPlayer, maximizingPlayer, alpha, beta, maxQuiesce) {
    nodesSearched++
    const standPat = simulator.evaluatePosition(state, currentPlayer)

    if (standPat >= beta) return standPat
    if (standPat > alpha) alpha = standPat
    if (maxQuiesce <= 0) return standPat
    if (Date.now() >= deadline) return standPat
    if (standPat + 1000 < alpha) return standPat

    const moves = simulator.getLegalMoves(state, currentPlayer)
    if (moves.length === 0) {
      if (simulator.isInCheck && simulator.isInCheck(state, currentPlayer)) return -100000
      return 0
    }
    const board = state && state.board ? state.board : null
    const captures = moves.filter(m => isCapture(m, board))
    if (captures.length === 0) return standPat

    if (simulator.hasMakeUnmake) {
      for (const move of captures) {
        if (Date.now() >= deadline) break
        const undo = simulator.makeMove(state, move, currentPlayer)
        const nextPlayer = simulator.nextPlayer(currentPlayer, false)
        const score = -quiesce(state, nextPlayer, maximizingPlayer, -beta, -alpha, maxQuiesce - 1)
        simulator.unmakeMove(state, move, undo)
        if (score >= beta) return score
        if (score > alpha) alpha = score
      }
    } else {
      for (const move of captures) {
        if (Date.now() >= deadline) break
        const { state: newState, continueTurn } = simulator.applyMove(state, move, currentPlayer)
        const nextPlayer = simulator.nextPlayer(currentPlayer, continueTurn)
        const score = -quiesce(newState, nextPlayer, maximizingPlayer, -beta, -alpha, maxQuiesce - 1)
        if (score >= beta) return score
        if (score > alpha) alpha = score
      }
    }

    return alpha
  }

  function orderMovesForSearch(moves, ttBestMove, state, playerIndex, ply) {
    if (orderMoves) return orderMoves(moves, state, playerIndex, ttBestMove)

    const plyKillers = ply !== undefined ? killers[ply] : [null, null]
    const board = state && state.board ? state.board : null

    return moves.slice().sort((a, b) => {
      return moveOrderScore(b, ttBestMove, board, plyKillers) -
             moveOrderScore(a, ttBestMove, board, plyKillers)
    })
  }

  function moveOrderScore(move, ttBestMove, board, plyKillers) {
    if (ttBestMove && movesEqual(move, ttBestMove)) return 200000

    if (isCapture(move, board)) {
      const victim = board && move.to !== undefined ? board[move.to] : null
      const attacker = board && move.from !== undefined ? board[move.from] : null
      const victimVal = victim ? (PIECE_ORDER[victim.type] || 100) : 100
      const attackerVal = attacker ? (PIECE_ORDER[attacker.type] || 100) : 100
      return 100000 + victimVal - (attackerVal >> 3)
    }

    if (move.promotion) return 90000

    if (plyKillers[0] && movesEqual(move, plyKillers[0])) return 80000
    if (plyKillers[1] && movesEqual(move, plyKillers[1])) return 70000

    if (move.castle) return 60000

    const histIdx = historyIndex(move)
    return history[histIdx] || 0
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
    const str = simulator.positionKey
      ? simulator.positionKey(state, playerIndex)
      : JSON.stringify(state) + playerIndex
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

function defaultIsCapture(move, board) {
  if (move.captures && move.captures.length > 0) return true
  if (move.capture) return true
  if (move.enPassant) return true
  if (board && move.to !== undefined && board[move.to]) return true
  return false
}

export { DIFFICULTIES }
