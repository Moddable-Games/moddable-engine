export function createDraughtsPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    rows: 8,
    cols: 8,
    piecesPerPlayer: 12,
    directions: 'diagonal',
    manCapture: 'forward',
    manMove: 'forward',
    kingMove: 'adjacent',
    kingCapture: 'adjacent',
    forcedCapture: true,
    maximalCapture: false,
    captureBackward: false,
    promotionDuring: false,
    flyingKings: false,
    removeImmediately: true,
  }

  const config = { ...defaults, ...variantConfig }

  let topology = null

  function cellIndex(row, col) {
    return row * config.cols + col
  }

  function rowCol(idx) {
    return [Math.floor(idx / config.cols), idx % config.cols]
  }

  function isPlayable(row, col) {
    if (config.directions === 'orthogonal') return true
    return (row + col) % 2 === 1
  }

  function forwardDirs(playerIndex) {
    if (config.directions === 'orthogonal') {
      const fwd = playerIndex === 0 ? -1 : 1
      return [[fwd, 0], [0, -1], [0, 1]]
    }
    const fwd = playerIndex === 0 ? -1 : 1
    return [[fwd, -1], [fwd, 1]]
  }

  function backwardDirs(playerIndex) {
    if (config.directions === 'orthogonal') {
      const bwd = playerIndex === 0 ? 1 : -1
      return [[bwd, 0]]
    }
    const bwd = playerIndex === 0 ? 1 : -1
    return [[bwd, -1], [bwd, 1]]
  }

  function allDirs() {
    if (config.directions === 'orthogonal') {
      return [[-1, 0], [1, 0], [0, -1], [0, 1]]
    }
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  }

  function inBounds(r, c) {
    return r >= 0 && r < config.rows && c >= 0 && c < config.cols
  }

  function getMoveDirs(piece, playerIndex) {
    if (piece.type === 'king') {
      return allDirs()
    }
    const fwd = forwardDirs(playerIndex)
    if (config.manMove === 'all') return allDirs()
    return fwd
  }

  function getCaptureDirs(piece, playerIndex) {
    if (piece.type === 'king') {
      return allDirs()
    }
    if (config.manCapture === 'all' || config.captureBackward) {
      return allDirs()
    }
    return forwardDirs(playerIndex)
  }

  function getMoveRange(piece) {
    if (piece.type === 'king') {
      return config.flyingKings ? config.rows : 1
    }
    return 1
  }

  function getCaptureRange(piece) {
    if (piece.type === 'king') {
      return config.flyingKings ? config.rows : 1
    }
    return 1
  }

  function findSimpleMoves(board, playerIndex) {
    const moves = []
    for (let i = 0; i < board.length; i++) {
      const piece = board[i]
      if (!piece || piece.owner !== playerIndex) continue
      const [r, c] = rowCol(i)
      const dirs = getMoveDirs(piece, playerIndex)
      const range = getMoveRange(piece)

      for (const [dr, dc] of dirs) {
        for (let dist = 1; dist <= range; dist++) {
          const nr = r + dr * dist
          const nc = c + dc * dist
          if (!inBounds(nr, nc)) break
          const target = cellIndex(nr, nc)
          if (board[target] !== null) break
          moves.push({ from: i, to: target })
        }
      }
    }
    return moves
  }

  function findCaptures(board, playerIndex, fromPos = null) {
    const allCaptures = []
    const positions = fromPos !== null ? [fromPos] : getAllPositions(board, playerIndex)

    for (const pos of positions) {
      const piece = board[pos]
      if (!piece || piece.owner !== playerIndex) continue
      const chains = findCaptureChains(board, pos, piece, playerIndex, [])
      for (const chain of chains) {
        allCaptures.push({
          from: pos,
          to: chain.landing,
          captures: chain.captured,
          path: chain.path,
          captureCount: chain.captured.length,
        })
      }
    }
    return allCaptures
  }

  function findCaptureChains(board, pos, piece, playerIndex, alreadyCaptured) {
    const [r, c] = rowCol(pos)
    const dirs = getCaptureDirs(piece, playerIndex)
    const scanRange = piece.type === 'king' && config.flyingKings ? config.rows : 2
    const chains = []

    for (const [dr, dc] of dirs) {
      let enemyPos = null

      for (let dist = 1; dist <= scanRange; dist++) {
        const mr = r + dr * dist
        const mc = c + dc * dist
        if (!inBounds(mr, mc)) break
        const midIdx = cellIndex(mr, mc)
        const midPiece = board[midIdx]

        if (enemyPos === null) {
          if (midPiece === null) continue
          if (midPiece.owner === playerIndex) break
          if (alreadyCaptured.includes(midIdx)) break
          enemyPos = midIdx
        } else {
          if (midPiece !== null) break

          const landingIdx = midIdx
          const newCaptured = [...alreadyCaptured, enemyPos]
          const tempBoard = [...board]
          tempBoard[pos] = null
          tempBoard[enemyPos] = null
          tempBoard[landingIdx] = piece

          let promoted = piece
          if (config.promotionDuring && piece.type === 'man') {
            const [lr] = rowCol(landingIdx)
            if (isPromotionRank(lr, playerIndex)) {
              promoted = { ...piece, type: 'king' }
            }
          }

          const deeper = findCaptureChains(tempBoard, landingIdx, promoted, playerIndex, newCaptured)
          if (deeper.length === 0) {
            chains.push({ landing: landingIdx, captured: newCaptured, path: [landingIdx] })
          } else {
            for (const sub of deeper) {
              chains.push({
                landing: sub.landing,
                captured: sub.captured,
                path: [landingIdx, ...sub.path],
              })
            }
          }

          if (piece.type !== 'king' || !config.flyingKings) break
        }
      }
    }
    return chains
  }

  function getAllPositions(board, playerIndex) {
    const positions = []
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === playerIndex) positions.push(i)
    }
    return positions
  }

  function isPromotionRank(row, playerIndex) {
    return playerIndex === 0 ? row === 0 : row === config.rows - 1
  }

  function buildInitialBoard() {
    const board = new Array(config.rows * config.cols).fill(null)
    let placed = [0, 0]

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        if (!isPlayable(r, c)) continue
        const idx = cellIndex(r, c)

        if (r >= config.rows - Math.ceil(config.piecesPerPlayer / (config.cols / 2)) && placed[1] < config.piecesPerPlayer) {
          board[idx] = { type: 'man', owner: 0 }
          placed[0]++
        } else if (r < Math.ceil(config.piecesPerPlayer / (config.cols / 2)) && placed[0] < config.piecesPerPlayer) {
          board[idx] = { type: 'man', owner: 1 }
          placed[1]++
        }
      }
    }

    return board
  }

  function buildSetupBoard() {
    const board = new Array(config.rows * config.cols).fill(null)
    const playableCols = Math.floor(config.cols / 2)
    const rowsNeeded = Math.ceil(config.piecesPerPlayer / playableCols)

    let count0 = 0
    for (let r = config.rows - 1; r >= config.rows - rowsNeeded && count0 < config.piecesPerPlayer; r--) {
      for (let c = 0; c < config.cols && count0 < config.piecesPerPlayer; c++) {
        if (!isPlayable(r, c)) continue
        board[cellIndex(r, c)] = { type: 'man', owner: 0 }
        count0++
      }
    }

    let count1 = 0
    for (let r = 0; r < rowsNeeded && count1 < config.piecesPerPlayer; r++) {
      for (let c = 0; c < config.cols && count1 < config.piecesPerPlayer; c++) {
        if (!isPlayable(r, c)) continue
        board[cellIndex(r, c)] = { type: 'man', owner: 1 }
        count1++
      }
    }

    return board
  }

  return {
    sliceName: 'draughts',
    pieceTypes: ['man', 'king'],
    vocabulary: {
      man: { symbols: { 0: 'w', 1: 'b' } },
      king: { symbols: { 0: 'W', 1: 'B' } },
    },
    config,
    rules: ['capture.replacement', 'forced-capture', 'chain-capture', 'promotion.rank-reach'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      return {
        board: buildSetupBoard(),
        _cols: config.cols,
        _chainActive: false,
        _chainFrom: null,
      }
    },

    validateMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex
      if (slice._chainActive) {
        if (move.from !== slice._chainFrom) return false
        const captures = findCaptures(slice.board, playerIndex, move.from)
        return captures.some(c => c.to === move.to)
      }
      const legal = this.getLegalMoves(slice, full)
      return legal.some(m => m.from === move.from && m.to === move.to)
    },

    applyMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex
      const board = [...slice.board]

      const piece = board[move.from]
      board[move.from] = null

      if (move.captures && move.captures.length > 0) {
        for (const cap of move.captures) {
          board[cap] = null
        }
      }

      let landingPiece = piece
      const [landingRow] = rowCol(move.to)
      if (piece.type === 'man' && isPromotionRank(landingRow, playerIndex)) {
        landingPiece = { ...piece, type: 'king' }
      }
      board[move.to] = landingPiece

      const furtherCaptures = findCaptures(board, playerIndex, move.to)
      if (move.captures && move.captures.length > 0 && furtherCaptures.length > 0 && landingPiece.type === piece.type) {
        return {
          state: {
            ...slice,
            board,
            _chainActive: true,
            _chainFrom: move.to,
          },
          continueTurn: true,
        }
      }

      return {
        ...slice,
        board,
        _chainActive: false,
        _chainFrom: null,
      }
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex

      if (slice._chainActive) {
        return findCaptures(slice.board, playerIndex, slice._chainFrom)
      }

      const captures = findCaptures(slice.board, playerIndex)
      if (config.forcedCapture && captures.length > 0) {
        if (config.maximalCapture) {
          const maxLen = Math.max(...captures.map(c => c.captureCount))
          return captures.filter(c => c.captureCount >= maxLen)
        }
        return captures
      }

      const simpleMoves = findSimpleMoves(slice.board, playerIndex)
      return [...captures, ...simpleMoves]
    },

    checkWin(slice, full) {
      const playerIndex = full.__players.currentIndex
      const opponent = 1 - playerIndex

      const opponentPieces = slice.board.filter(p => p && p.owner === opponent)
      if (opponentPieces.length === 0) {
        return playerIndex === 0 ? 'player1' : 'player2'
      }

      const opponentMoves = findCaptures(slice.board, opponent)
      if (opponentMoves.length === 0) {
        const opponentSimple = findSimpleMoves(slice.board, opponent)
        if (opponentSimple.length === 0) {
          return playerIndex === 0 ? 'player1' : 'player2'
        }
      }

      return null
    },
  }
}
