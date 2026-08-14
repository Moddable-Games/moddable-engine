function linesThrough(pos, cols, rows) {
  const row = Math.floor(pos / cols)
  const col = pos % cols
  return [[0, 1], [1, 0], [1, 1], [1, -1]].map(([dr, dc]) => ({ row, col, dr, dc }))
}

export function longestRun(board, pos, colour, cols, rows) {
  let best = 0
  for (const { row, col, dr, dc } of linesThrough(pos, cols, rows)) {
    let count = 1
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < rows && c >= 0 && c < cols && board[r * cols + c] === colour) {
        count++
        r += dr * sign
        c += dc * sign
      }
    }
    if (count > best) best = count
  }
  return best
}

function winnerFromRuns(slice, exactly) {
  const cols = slice.cols || Math.round(Math.sqrt(slice.board.length))
  const rows = slice.rows || Math.round(slice.board.length / cols)
  const last = slice.lastPlaced
  if (last === null || last === undefined) return null
  const colour = slice.board[last]
  if (!colour) return null

  const run = longestRun(slice.board, last, colour, cols, rows)
  if (exactly ? run === 5 : run >= 5) return colour === 'black' ? 0 : 1
  return null
}

export const gomoku = {
  key: 'gomoku',

  hooks: {
    moveFilter(moves) {
      return moves.filter(m => m.action !== 'pass')
    },
    captureEffect() {
      return []
    },
  },

  winCondition(slice) {
    const winner = winnerFromRuns(slice, true)
    if (winner !== null) return winner
    if (slice.board.every(cell => cell !== null)) return 'draw'
    return null
  },
}

function pairCaptures(coord, board, opponentColour, slice) {
  const cols = slice.cols || Math.round(Math.sqrt(board.length))
  const rows = slice.rows || Math.round(board.length / cols)
  const row = Math.floor(coord / cols)
  const col = coord % cols
  const self = board[coord]
  const captured = []

  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    for (const sign of [1, -1]) {
      const r1 = row + dr * sign, c1 = col + dc * sign
      const r2 = row + dr * sign * 2, c2 = col + dc * sign * 2
      const r3 = row + dr * sign * 3, c3 = col + dc * sign * 3
      if (r3 < 0 || r3 >= rows || c3 < 0 || c3 >= cols) continue
      const i1 = r1 * cols + c1
      const i2 = r2 * cols + c2
      const i3 = r3 * cols + c3
      if (board[i1] === opponentColour && board[i2] === opponentColour && board[i3] === self) {
        board[i1] = null
        board[i2] = null
        captured.push(i1, i2)
      }
    }
  }
  return captured
}

function linePattern(board, pos, colour, dr, dc, cols, rows) {
  const r0 = Math.floor(pos / cols), c0 = pos % cols
  const cells = [pos]
  for (const sign of [1, -1]) {
    let r = r0 + dr * sign, c = c0 + dc * sign
    while (r >= 0 && r < rows && c >= 0 && c < cols && board[r * cols + c] === colour) {
      cells.push(r * cols + c)
      r += dr * sign
      c += dc * sign
    }
  }
  return cells.length
}

function countOpenEnds(board, pos, colour, dr, dc, cols, rows) {
  const r0 = Math.floor(pos / cols), c0 = pos % cols
  let open = 0
  for (const sign of [1, -1]) {
    let r = r0, c = c0
    while (true) {
      r += dr * sign
      c += dc * sign
      if (r < 0 || r >= rows || c < 0 || c >= cols) break
      if (board[r * cols + c] !== colour) {
        if (board[r * cols + c] === null) open++
        break
      }
    }
  }
  return open
}

function isRenjuForbidden(board, pos, colour, cols, rows) {
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (const [dr, dc] of DIRS) {
    if (linePattern(board, pos, colour, dr, dc, cols, rows) >= 6) return true
  }
  let fours = 0, openThrees = 0
  for (const [dr, dc] of DIRS) {
    const len = linePattern(board, pos, colour, dr, dc, cols, rows)
    const openEnds = countOpenEnds(board, pos, colour, dr, dc, cols, rows)
    if (len === 4 && openEnds >= 1) fours++
    if (len === 3 && openEnds === 2) openThrees++
  }
  if (fours >= 2) return true
  if (openThrees >= 2) return true
  return false
}

export const renju = {
  key: 'renju',

  hooks: {
    moveFilter(moves, slice, full) {
      const playerIdx = full && full.__players ? full.__players.currentIndex : 0
      if (playerIdx !== 0) return moves.filter(m => m.action !== 'pass')
      const cols = slice.cols || Math.round(Math.sqrt(slice.board.length))
      const rows = slice.rows || Math.round(slice.board.length / cols)
      return moves.filter(m => {
        if (m.action === 'pass') return false
        const testBoard = [...slice.board]
        testBoard[m.coord] = 'black'
        if (linePattern(testBoard, m.coord, 'black', 0, 1, cols, rows) === 5 ||
            linePattern(testBoard, m.coord, 'black', 1, 0, cols, rows) === 5 ||
            linePattern(testBoard, m.coord, 'black', 1, 1, cols, rows) === 5 ||
            linePattern(testBoard, m.coord, 'black', 1, -1, cols, rows) === 5) return true
        return !isRenjuForbidden(testBoard, m.coord, 'black', cols, rows)
      })
    },
    captureEffect() {
      return []
    },
  },

  winCondition(slice) {
    const cols = slice.cols || Math.round(Math.sqrt(slice.board.length))
    const rows = slice.rows || Math.round(slice.board.length / cols)
    const last = slice.lastPlaced
    if (last === null || last === undefined) return null
    const colour = slice.board[last]
    if (!colour) return null
    const run = longestRun(slice.board, last, colour, cols, rows)
    if (colour === 'black') {
      if (run === 5) return 0
      if (run >= 6) return 1
    } else {
      if (run >= 5) return 1
    }
    if (slice.board.every(cell => cell !== null)) return 'draw'
    return null
  },
}

export const ninukiRenju = {
  key: 'ninuki-renju',

  hooks: {
    moveFilter(moves) {
      return moves.filter(m => m.action !== 'pass')
    },
    captureEffect: pairCaptures,
  },

  winCondition(slice) {
    const winner = winnerFromRuns(slice, false)
    if (winner !== null) return winner
    if ((slice.captures[0] || 0) >= 10) return 0
    if ((slice.captures[1] || 0) >= 10) return 1
    if (slice.board.every(cell => cell !== null)) return 'draw'
    return null
  },
}
