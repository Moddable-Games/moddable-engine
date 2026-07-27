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
  if (exactly ? run === 5 : run >= 5) return colour
  return null
}

export const gomoku = {
  key: 'gomoku',
  label: 'Gomoku',
  group: 'Five in a Row',
  description: 'Stones are placed and never captured. The first player to form an unbroken line of exactly five wins; longer overlines do not count.',
  rule: 'Board: 15×15 · Win: Five in an unbroken row',
  size: 15,
  komi: 0,
  scoring: 'none',
  captures: false,
  allowPass: false,
  suicideAllowed: true,
  superko: false,

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
    if (winner) return winner
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

export const ninukiRenju = {
  key: 'ninuki-renju',
  extends: 'gomoku',
  label: 'Ninuki-Renju',
  group: 'Five in a Row',
  description: 'Five in a row wins, and pairs of stones flanked on both ends are captured. Ten captured stones also wins.',
  rule: 'Board: 15×15 · Win: Five in a row or ten captured stones',
  captures: 'pairs',
  captureTarget: 10,

  hooks: {
    moveFilter(moves) {
      return moves.filter(m => m.action !== 'pass')
    },
    captureEffect: pairCaptures,
  },

  winCondition(slice) {
    const winner = winnerFromRuns(slice, false)
    if (winner) return winner
    if ((slice.captures[0] || 0) >= 10) return 'black'
    if ((slice.captures[1] || 0) >= 10) return 'white'
    if (slice.board.every(cell => cell !== null)) return 'draw'
    return null
  },
}
