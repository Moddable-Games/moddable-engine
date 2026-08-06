/**
 * Go playout policy for MCTS rollouts.
 *
 * Replaces pure-random move selection with a weighted policy that produces
 * recognisable Go play. Rules in priority order:
 *
 * 1. HARD: Never fill own eyes (single empty point surrounded by own stones)
 * 2. Prefer captures and atari escapes (heavy weight)
 * 3. Locality bias — prefer points near existing stones
 * 4. Line penalty — discourage 1st/2nd line in the opening
 * 5. Pass when no non-eye-filling move improves position
 */

/**
 * Compute grid neighbours for a cell index on a square board.
 */
function gridNeighbours(idx, cols, size) {
  const row = Math.floor(idx / cols)
  const col = idx % cols
  const rows = Math.floor(size / cols)
  const n = []
  if (row > 0) n.push(idx - cols)
  if (row < rows - 1) n.push(idx + cols)
  if (col > 0) n.push(idx - 1)
  if (col < cols - 1) n.push(idx + 1)
  return n
}

/**
 * Determine if a cell is a true eye for the given colour.
 * An eye is an empty cell where ALL orthogonal neighbours are the player's stones.
 */
function isEye(coord, board, colour, cols, size) {
  const neighbours = gridNeighbours(coord, cols, size)
  if (neighbours.length === 0) return false
  for (const n of neighbours) {
    if (board[n] !== colour) return false
  }
  return true
}

/**
 * Check if a stone at `coord` belonging to `colour` is in atari (exactly 1 liberty).
 */
function isInAtari(coord, board, colour, cols, size) {
  const visited = new Set()
  const stack = [coord]
  let liberties = 0

  while (stack.length > 0) {
    const pos = stack.pop()
    if (visited.has(pos)) continue
    visited.add(pos)
    const neighbours = gridNeighbours(pos, cols, size)
    for (const n of neighbours) {
      if (board[n] === null) {
        liberties++
        if (liberties > 1) return false
      } else if (board[n] === colour && !visited.has(n)) {
        stack.push(n)
      }
    }
  }
  return liberties === 1
}

/**
 * Check if placing at `coord` would capture any opponent stones.
 */
function wouldCapture(coord, board, opponentColour, cols, size) {
  const neighbours = gridNeighbours(coord, cols, size)
  for (const n of neighbours) {
    if (board[n] === opponentColour) {
      if (isInAtari(n, board, opponentColour, cols, size)) {
        return true
      }
    }
  }
  return false
}

/**
 * Check if placing at `coord` would save one of our groups from atari.
 */
function wouldEscapeAtari(coord, board, ownColour, cols, size) {
  const neighbours = gridNeighbours(coord, cols, size)
  for (const n of neighbours) {
    if (board[n] === ownColour) {
      if (isInAtari(n, board, ownColour, cols, size)) {
        return true
      }
    }
  }
  return false
}

/**
 * Calculate minimum distance to edge (line number, 1-based).
 */
function lineNumber(coord, cols, size) {
  const rows = Math.floor(size / cols)
  const row = Math.floor(coord / cols)
  const col = coord % cols
  return Math.min(row, rows - 1 - row, col, cols - 1 - col) + 1
}

/**
 * Compute locality score: how many stones (of either colour) are within
 * Manhattan distance 2 of this cell.
 */
function localityScore(coord, board, cols, size) {
  let score = 0
  const row = Math.floor(coord / cols)
  const col = coord % cols
  const rows = Math.floor(size / cols)

  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (dr === 0 && dc === 0) continue
      if (Math.abs(dr) + Math.abs(dc) > 2) continue
      const r = row + dr
      const c = col + dc
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue
      const idx = r * cols + c
      if (board[idx] !== null) score++
    }
  }
  return score
}

/**
 * Count occupied cells on the board (to gauge game phase).
 */
function stoneCount(board) {
  let count = 0
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null) count++
  }
  return count
}

/**
 * Create a Go playout policy function.
 *
 * Returns a function (state, playerIndex, legalMoves, simulator) => move
 * that selects a move using weighted random sampling with Go heuristics.
 */
/**
 * Create an expansion policy for MCTS that applies line penalties.
 * Returns a function (state, playerIndex, moves) => weights[]
 * Used to bias which untried moves get expanded first.
 */
export function createGoExpansionPolicy() {
  return function goExpansionPolicy(state, playerIndex, moves) {
    const board = state.board
    const size = board.length
    const cols = state.cols || Math.round(Math.sqrt(size))
    const stones = stoneCount(board)
    const fillRatio = stones / size
    const isOpening = fillRatio < 0.25

    const weights = new Array(moves.length)
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i]
      if (move.action === 'pass') {
        weights[i] = 0.1
        continue
      }
      let w = 1.0
      if (isOpening) {
        const line = lineNumber(move.coord, cols, size)
        if (line === 1) w = 0.05
        else if (line === 2) w = 0.2
        else if (line === 3) w = 1.5
        else if (line === 4) w = 1.8
      }
      weights[i] = w
    }
    return weights
  }
}

export function createGoPlayoutPolicy() {
  return function goPlayoutPolicy(state, playerIndex, legalMoves) {
    const board = state.board
    const size = board.length
    const cols = state.cols || Math.round(Math.sqrt(size))
    const ownColour = playerIndex === 0 ? 'black' : 'white'
    const oppColour = playerIndex === 0 ? 'white' : 'black'

    const stones = stoneCount(board)
    const fillRatio = stones / size
    // Opening phase: first ~25% of board
    const isOpening = fillRatio < 0.25

    // Separate pass moves from board moves
    let passMove = null
    const boardMoves = []
    for (const move of legalMoves) {
      if (move.action === 'pass') {
        passMove = move
      } else {
        boardMoves.push(move)
      }
    }

    if (boardMoves.length === 0) {
      return passMove || legalMoves[0]
    }

    // Calculate weights for each board move
    const weights = new Array(boardMoves.length)
    let totalWeight = 0
    let hasNonEyeMove = false

    for (let i = 0; i < boardMoves.length; i++) {
      const move = boardMoves[i]
      const coord = move.coord

      // HARD RULE: Never fill own eyes
      if (isEye(coord, board, ownColour, cols, size)) {
        weights[i] = 0
        continue
      }

      hasNonEyeMove = true
      let weight = 1.0

      // Capture bonus (very high priority)
      if (wouldCapture(coord, board, oppColour, cols, size)) {
        weight += 20.0
      }

      // Atari escape bonus (high priority)
      if (wouldEscapeAtari(coord, board, ownColour, cols, size)) {
        weight += 15.0
      }

      // Locality bias: prefer moves near existing stones
      const locality = localityScore(coord, board, cols, size)
      if (locality > 0) {
        weight += locality * 2.0
      }

      // Line penalty in opening
      if (isOpening) {
        const line = lineNumber(coord, cols, size)
        if (line === 1) {
          weight *= 0.05 // heavy penalty for edge
        } else if (line === 2) {
          weight *= 0.15 // substantial penalty for second line
        } else if (line === 3 || line === 4) {
          weight *= 1.5 // slight bonus for 3rd/4th line
        }
      }

      weights[i] = weight
      totalWeight += weight
    }

    // If all board moves are eye-fills, pass
    if (!hasNonEyeMove || totalWeight === 0) {
      return passMove || legalMoves[0]
    }

    // Weighted random selection
    let r = Math.random() * totalWeight
    for (let i = 0; i < boardMoves.length; i++) {
      r -= weights[i]
      if (r <= 0) return boardMoves[i]
    }

    // Fallback (floating point edge case)
    return boardMoves[boardMoves.length - 1]
  }
}
