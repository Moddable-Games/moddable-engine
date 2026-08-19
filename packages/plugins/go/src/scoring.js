const BLACK = 'black'
const WHITE = 'white'

export function emptyRegions(board, getNeighbours) {
  const regions = []
  const seen = new Set()

  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null || seen.has(i)) continue

    const cells = []
    const borders = new Set()
    const stack = [i]
    seen.add(i)

    while (stack.length > 0) {
      const pos = stack.pop()
      cells.push(pos)
      for (const n of getNeighbours(pos)) {
        if (board[n] === null) {
          if (!seen.has(n)) {
            seen.add(n)
            stack.push(n)
          }
        } else {
          borders.add(board[n])
        }
      }
    }

    let owner = null
    if (borders.size === 1) owner = [...borders][0]
    regions.push({ cells, owner, borders: [...borders] })
  }

  return regions
}

export function removeDeadStones(board, deadStones = []) {
  const working = [...board]
  const prisoners = { [BLACK]: 0, [WHITE]: 0 }

  for (const pos of deadStones) {
    const colour = working[pos]
    if (!colour) continue
    prisoners[colour] = (prisoners[colour] || 0) + 1
    working[pos] = null
  }

  return { board: working, prisoners }
}

export function countStones(board) {
  const counts = { [BLACK]: 0, [WHITE]: 0 }
  for (const cell of board) {
    if (cell === BLACK) counts[BLACK]++
    else if (cell === WHITE) counts[WHITE]++
  }
  return counts
}

export function scoreGame(slice, options = {}) {
  const {
    getNeighbours,
    method = slice.scoring || 'territory',
    komi = slice.komi !== undefined ? slice.komi : 6.5,
    deadStones = slice.deadStones || [],
    captures = slice.captures || { 0: 0, 1: 0 },
  } = options

  if (typeof getNeighbours !== 'function') {
    throw new Error('scoreGame requires a getNeighbours function')
  }

  const { board, prisoners } = removeDeadStones(slice.board, deadStones)
  const regions = emptyRegions(board, getNeighbours)

  const territory = { [BLACK]: 0, [WHITE]: 0 }
  const neutral = []
  for (const region of regions) {
    if (region.owner) territory[region.owner] += region.cells.length
    else neutral.push(...region.cells)
  }

  const stones = countStones(board)

  let blackScore
  let whiteScore

  if (method === 'area') {
    blackScore = stones[BLACK] + territory[BLACK]
    whiteScore = stones[WHITE] + territory[WHITE] + komi
  } else {
    const blackPrisoners = (captures[0] || 0) + (prisoners[WHITE] || 0)
    const whitePrisoners = (captures[1] || 0) + (prisoners[BLACK] || 0)
    blackScore = territory[BLACK] + blackPrisoners
    whiteScore = territory[WHITE] + whitePrisoners + komi
  }

  const margin = Math.abs(blackScore - whiteScore)
  let winner = 'draw'
  if (blackScore > whiteScore) winner = 0
  else if (whiteScore > blackScore) winner = 1

  return {
    method,
    komi,
    winner,
    margin,
    scores: { [BLACK]: blackScore, [WHITE]: whiteScore },
    territory,
    stones,
    neutral,
    deadStones: [...deadStones],
  }
}

export function estimateScore(slice, getNeighbours) {
  return scoreGame(slice, { getNeighbours, deadStones: [] })
}
