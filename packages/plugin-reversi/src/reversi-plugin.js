export function createReversiPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    rows: 8,
    cols: 8,
    winCondition: 'most',
  }

  const config = { ...defaults, ...variantConfig }

  const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ]

  let topology = null

  function cellIndex(row, col) {
    return row * config.cols + col
  }

  function rowCol(idx) {
    return [Math.floor(idx / config.cols), idx % config.cols]
  }

  function inBounds(r, c) {
    return r >= 0 && r < config.rows && c >= 0 && c < config.cols
  }

  function findFlips(board, pos, playerIndex) {
    const [r, c] = rowCol(pos)
    const opponent = 1 - playerIndex
    const allFlips = []

    for (const [dr, dc] of DIRECTIONS) {
      const lineFlips = []
      let nr = r + dr
      let nc = c + dc

      while (inBounds(nr, nc)) {
        const idx = cellIndex(nr, nc)
        if (board[idx] === opponent) {
          lineFlips.push(idx)
        } else if (board[idx] === playerIndex) {
          if (lineFlips.length > 0) {
            allFlips.push(...lineFlips)
          }
          break
        } else {
          break
        }
        nr += dr
        nc += dc
      }
    }

    return allFlips
  }

  function buildInitialBoard() {
    const board = new Array(config.rows * config.cols).fill(null)
    const midR = Math.floor(config.rows / 2)
    const midC = Math.floor(config.cols / 2)
    board[cellIndex(midR - 1, midC - 1)] = 1
    board[cellIndex(midR - 1, midC)] = 0
    board[cellIndex(midR, midC - 1)] = 0
    board[cellIndex(midR, midC)] = 1
    return board
  }

  return {
    sliceName: 'reversi',
    pieceTypes: ['disc'],
    vocabulary: {
      disc: { symbols: { 0: 'B', 1: 'W' } },
    },
    config,
    rules: ['capture.flanking', 'win.count'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      return {
        board: buildInitialBoard(),
        passCount: 0,
      }
    },

    validateMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex
      if (move.action === 'pass') {
        const placements = this.getLegalMoves(slice, full).filter(m => m.action !== 'pass')
        return placements.length === 0
      }
      if (slice.board[move.cell] !== null) return false
      const flips = findFlips(slice.board, move.cell, playerIndex)
      return flips.length > 0
    },

    applyMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex

      if (move.action === 'pass') {
        return { ...slice, passCount: slice.passCount + 1 }
      }

      const board = [...slice.board]
      board[move.cell] = playerIndex
      const flips = findFlips(board, move.cell, playerIndex)
      for (const idx of flips) {
        board[idx] = playerIndex
      }

      return { ...slice, board, passCount: 0 }
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex
      const moves = []

      for (let i = 0; i < slice.board.length; i++) {
        if (slice.board[i] !== null) continue
        const flips = findFlips(slice.board, i, playerIndex)
        if (flips.length > 0) {
          moves.push({ cell: i, flips })
        }
      }

      if (moves.length === 0) {
        moves.push({ action: 'pass' })
      }

      return moves
    },

    checkWin(slice, full) {
      if (slice.passCount < 2) {
        const emptyCount = slice.board.filter(c => c === null).length
        if (emptyCount > 0) return null
      }

      const count0 = slice.board.filter(c => c === 0).length
      const count1 = slice.board.filter(c => c === 1).length

      if (config.winCondition === 'most') {
        if (count0 > count1) return 'player1'
        if (count1 > count0) return 'player2'
        return 'draw'
      }

      if (config.winCondition === 'fewest') {
        if (count0 < count1) return 'player1'
        if (count1 < count0) return 'player2'
        return 'draw'
      }

      return null
    },
  }
}
