export function createXiangqiPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    rows: 10,
    cols: 9,
    hasRiver: true,
    cannonJumpToMove: false,
    flyingGeneralRule: true,
    passAllowed: false,
  }

  const config = { ...defaults, ...variantConfig }

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

  function inPalace(r, c, playerIndex) {
    if (c < 3 || c > 5) return false
    if (playerIndex === 0) return r >= 7 && r <= 9
    return r >= 0 && r <= 2
  }

  function acrossRiver(r, playerIndex) {
    if (playerIndex === 0) return r <= 4
    return r >= 5
  }

  function generatePieceMoves(board, pos, piece, playerIndex) {
    const [r, c] = rowCol(pos)
    const moves = []

    switch (piece.type) {
      case 'general': {
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = r + dr
          const nc = c + dc
          if (!inBounds(nr, nc)) continue
          if (!inPalace(nr, nc, playerIndex)) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) {
            moves.push({ from: pos, to: idx })
          }
        }
        break
      }

      case 'advisor': {
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const nr = r + dr
          const nc = c + dc
          if (!inBounds(nr, nc)) continue
          if (!inPalace(nr, nc, playerIndex)) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) {
            moves.push({ from: pos, to: idx })
          }
        }
        break
      }

      case 'elephant': {
        for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
          const nr = r + dr
          const nc = c + dc
          if (!inBounds(nr, nc)) continue
          if (config.hasRiver && acrossRiver(nr, playerIndex)) continue
          const blockR = r + dr / 2
          const blockC = c + dc / 2
          if (board[cellIndex(blockR, blockC)] !== null) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) {
            moves.push({ from: pos, to: idx })
          }
        }
        break
      }

      case 'horse': {
        const horseMoves = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]]
        for (const [dr, dc] of horseMoves) {
          const nr = r + dr
          const nc = c + dc
          if (!inBounds(nr, nc)) continue
          const blockR = r + (dr > 0 ? 1 : dr < 0 ? -1 : 0)
          const blockC = c + (dc > 0 ? 1 : dc < 0 ? -1 : 0)
          const legBlock = Math.abs(dr) > Math.abs(dc)
            ? cellIndex(r + (dr > 0 ? 1 : -1), c)
            : cellIndex(r, c + (dc > 0 ? 1 : -1))
          if (board[legBlock] !== null) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) {
            moves.push({ from: pos, to: idx })
          }
        }
        break
      }

      case 'chariot': {
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          for (let dist = 1; dist < Math.max(config.rows, config.cols); dist++) {
            const nr = r + dr * dist
            const nc = c + dc * dist
            if (!inBounds(nr, nc)) break
            const idx = cellIndex(nr, nc)
            if (board[idx] !== null) {
              if (board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
              break
            }
            moves.push({ from: pos, to: idx })
          }
        }
        break
      }

      case 'cannon': {
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          let foundScreen = false
          for (let dist = 1; dist < Math.max(config.rows, config.cols); dist++) {
            const nr = r + dr * dist
            const nc = c + dc * dist
            if (!inBounds(nr, nc)) break
            const idx = cellIndex(nr, nc)
            if (!foundScreen) {
              if (board[idx] !== null) {
                foundScreen = true
              } else {
                if (!config.cannonJumpToMove) {
                  moves.push({ from: pos, to: idx })
                }
              }
            } else {
              if (board[idx] !== null) {
                if (board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
                break
              }
              if (config.cannonJumpToMove) {
                moves.push({ from: pos, to: idx })
              }
            }
          }
          if (!config.cannonJumpToMove) continue
        }
        break
      }

      case 'soldier': {
        const fwd = playerIndex === 0 ? -1 : 1
        const nr = r + fwd
        if (inBounds(nr, c)) {
          const idx = cellIndex(nr, c)
          if (board[idx] === null || board[idx].owner !== playerIndex) {
            moves.push({ from: pos, to: idx })
          }
        }
        if (acrossRiver(r, playerIndex)) {
          for (const dc of [-1, 1]) {
            const nc = c + dc
            if (!inBounds(r, nc)) continue
            const idx = cellIndex(r, nc)
            if (board[idx] === null || board[idx].owner !== playerIndex) {
              moves.push({ from: pos, to: idx })
            }
          }
        }
        break
      }
    }

    return moves
  }

  function findGeneral(board, playerIndex) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === playerIndex && board[i].type === 'general') return i
    }
    return -1
  }

  function violatesFlyingGeneral(board) {
    if (!config.flyingGeneralRule) return false
    const g0 = findGeneral(board, 0)
    const g1 = findGeneral(board, 1)
    if (g0 === -1 || g1 === -1) return false

    const [r0, c0] = rowCol(g0)
    const [r1, c1] = rowCol(g1)
    if (c0 !== c1) return false

    const minR = Math.min(r0, r1)
    const maxR = Math.max(r0, r1)
    for (let r = minR + 1; r < maxR; r++) {
      if (board[cellIndex(r, c0)] !== null) return false
    }
    return true
  }

  function isInCheck(board, playerIndex) {
    const genPos = findGeneral(board, playerIndex)
    if (genPos === -1) return true
    const opponent = 1 - playerIndex
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].owner !== opponent) continue
      const attacks = generatePieceMoves(board, i, board[i], opponent)
      if (attacks.some(m => m.to === genPos)) return true
    }
    if (violatesFlyingGeneral(board)) return true
    return false
  }

  return {
    sliceName: 'xiangqi',
    pieceTypes: ['general', 'advisor', 'elephant', 'horse', 'chariot', 'cannon', 'soldier'],
    vocabulary: {
      general: { symbols: { 0: 'K', 1: 'k' } },
      advisor: { symbols: { 0: 'A', 1: 'a' } },
      elephant: { symbols: { 0: 'E', 1: 'e' } },
      horse: { symbols: { 0: 'H', 1: 'h' } },
      chariot: { symbols: { 0: 'R', 1: 'r' } },
      cannon: { symbols: { 0: 'C', 1: 'c' } },
      soldier: { symbols: { 0: 'S', 1: 's' } },
    },
    config,
    rules: ['constraint.region', 'capture.screen-jump', 'constraint.facing', 'check', 'checkmate'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      const board = new Array(config.rows * config.cols).fill(null)
      return { board, _cols: config.cols }
    },

    validateMove(move, slice, full) {
      if (config.passAllowed && move.action === 'pass') return true
      const legal = this.getLegalMoves(slice, full)
      return legal.some(m => m.from === move.from && m.to === move.to)
    },

    applyMove(move, slice, full) {
      if (move.action === 'pass') return slice
      const board = [...slice.board]
      board[move.to] = board[move.from]
      board[move.from] = null
      return { ...slice, board }
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex
      const allMoves = []

      for (let i = 0; i < slice.board.length; i++) {
        const piece = slice.board[i]
        if (!piece || piece.owner !== playerIndex) continue
        const pieceMoves = generatePieceMoves(slice.board, i, piece, playerIndex)
        allMoves.push(...pieceMoves)
      }

      if (config.passAllowed) {
        allMoves.push({ action: 'pass' })
      }

      return allMoves.filter(m => {
        if (m.action === 'pass') return true
        const testBoard = [...slice.board]
        testBoard[m.to] = testBoard[m.from]
        testBoard[m.from] = null
        return !isInCheck(testBoard, playerIndex)
      })
    },

    checkWin(slice, full) {
      const playerIndex = full.__players.currentIndex
      const opponent = 1 - playerIndex

      if (findGeneral(slice.board, opponent) === -1) {
        return playerIndex === 0 ? 'player1' : 'player2'
      }

      if (isInCheck(slice.board, opponent)) {
        const oppFull = { __players: { currentIndex: opponent } }
        const oppMoves = this.getLegalMoves(slice, oppFull)
        if (oppMoves.length === 0) return playerIndex === 0 ? 'player1' : 'player2'
      }

      return null
    },
  }
}
