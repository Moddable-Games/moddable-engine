export function createHalmaPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    rows: 16,
    cols: 16,
    piecesPerPlayer: 19,
    campLock: true,
  }

  const config = { ...defaults, ...variantConfig }

  const ALL_DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ]

  let topology = null
  let camps = null

  function cellIndex(row, col) {
    return row * config.cols + col
  }

  function rowCol(idx) {
    return [Math.floor(idx / config.cols), idx % config.cols]
  }

  function inBounds(r, c) {
    return r >= 0 && r < config.rows && c >= 0 && c < config.cols
  }

  function buildCamps() {
    const camp0 = buildCornerCamp(config.rows - 1, 0, -1, 1)
    const camp1 = buildCornerCamp(0, config.cols - 1, 1, -1)
    return [camp0, camp1]
  }

  function buildCornerCamp(startRow, startCol, rowDir, colDir) {
    const camp = new Set()
    let remaining = config.piecesPerPlayer
    let row = startRow

    while (remaining > 0) {
      const rowSize = Math.min(remaining, config.cols)
      for (let i = 0; i < rowSize; i++) {
        const col = colDir > 0 ? i : config.cols - 1 - i
        camp.add(cellIndex(row, col))
        remaining--
        if (remaining === 0) break
      }
      row += rowDir
    }
    return camp
  }

  function findStepMoves(board, pos) {
    const [r, c] = rowCol(pos)
    const moves = []
    for (const [dr, dc] of ALL_DIRS) {
      const nr = r + dr
      const nc = c + dc
      if (!inBounds(nr, nc)) continue
      const idx = cellIndex(nr, nc)
      if (board[idx] === null) {
        moves.push({ from: pos, to: idx })
      }
    }
    return moves
  }

  function findHopChains(board, startPos) {
    const visited = new Set([startPos])
    const results = []
    const queue = [startPos]

    while (queue.length > 0) {
      const pos = queue.shift()
      const [r, c] = rowCol(pos)

      for (const [dr, dc] of ALL_DIRS) {
        const midR = r + dr
        const midC = c + dc
        if (!inBounds(midR, midC)) continue
        const midIdx = cellIndex(midR, midC)
        if (board[midIdx] === null) continue

        const landR = midR + dr
        const landC = midC + dc
        if (!inBounds(landR, landC)) continue
        const landIdx = cellIndex(landR, landC)
        if (board[landIdx] !== null) continue
        if (visited.has(landIdx)) continue

        visited.add(landIdx)
        results.push({ from: startPos, to: landIdx })
        queue.push(landIdx)
      }
    }

    return results
  }

  function isInCamp(pos, campIndex) {
    if (!camps) return false
    return camps[campIndex].has(pos)
  }

  return {
    sliceName: 'halma',
    pieceTypes: ['piece'],
    vocabulary: {
      piece: { symbols: { 0: 'W', 1: 'B' } },
    },
    config,
    rules: ['movement.chain-hop', 'win.camp-occupation'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      camps = config.camps || buildCamps()
      const board = new Array(config.rows * config.cols).fill(null)

      for (const pos of camps[0]) {
        board[pos] = 0
      }
      for (const pos of camps[1]) {
        board[pos] = 1
      }

      return { board, _cols: config.cols }
    },

    validateMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex
      if (slice.board[move.from] !== playerIndex) return false
      if (slice.board[move.to] !== null) return false

      if (config.campLock && isInCamp(move.from, 1 - playerIndex)) {
        if (!isInCamp(move.to, 1 - playerIndex)) return false
      }

      return true
    },

    applyMove(move, slice, full) {
      const board = [...slice.board]
      board[move.to] = board[move.from]
      board[move.from] = null
      return { ...slice, board }
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex
      const targetCamp = 1 - playerIndex
      let moves = []

      for (let i = 0; i < slice.board.length; i++) {
        if (slice.board[i] !== playerIndex) continue

        const steps = findStepMoves(slice.board, i)
        const hops = findHopChains(slice.board, i)
        moves.push(...steps, ...hops)
      }

      if (config.campLock) {
        moves = moves.filter(m => {
          if (isInCamp(m.from, targetCamp)) {
            return isInCamp(m.to, targetCamp)
          }
          return true
        })
      }

      return moves
    },

    checkWin(slice, full) {
      for (let p = 0; p < 2; p++) {
        const targetCamp = 1 - p
        let allInCamp = true
        for (const pos of camps[targetCamp]) {
          if (slice.board[pos] !== p) {
            allInCamp = false
            break
          }
        }
        if (allInCamp) return p === 0 ? 'player1' : 'player2'
      }
      return null
    },
  }
}
