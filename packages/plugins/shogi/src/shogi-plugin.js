export function createShogiPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    rows: 9,
    cols: 9,
    promotionZone: 3,
    dropPawnFileLimit: true,
    dropCheckmateLimit: true,
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

  function isInPromotionZone(row, playerIndex) {
    if (playerIndex === 0) return row < config.promotionZone
    return row >= config.rows - config.promotionZone
  }

  function flipDirs(dirs, playerIndex) {
    if (playerIndex === 0) return dirs
    return dirs.map(([dr, dc]) => [-dr, dc])
  }

  const PIECE_MOVES = {
    king: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
    rook: 'slide_orthogonal',
    bishop: 'slide_diagonal',
    gold: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
    silver: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]],
    knight: [[-2, -1], [-2, 1]],
    lance: 'slide_forward',
    pawn: [[-1, 0]],
    promoted_rook: 'slide_orthogonal_plus_diag_step',
    promoted_bishop: 'slide_diagonal_plus_orth_step',
    promoted_silver: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
    promoted_knight: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
    promoted_lance: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
    promoted_pawn: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
  }

  function getPromotedType(type) {
    if (type.startsWith('promoted_')) return null
    if (type === 'king' || type === 'gold') return null
    return `promoted_${type}`
  }

  function getDemotedType(type) {
    if (type.startsWith('promoted_')) return type.slice(9)
    return type
  }

  function generatePieceMoves(board, pos, piece, playerIndex) {
    const [r, c] = rowCol(pos)
    const moves = []
    const type = piece.type
    const moveDef = PIECE_MOVES[type]

    if (moveDef === 'slide_orthogonal' || moveDef === 'slide_orthogonal_plus_diag_step') {
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        for (let dist = 1; dist < config.rows; dist++) {
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
      if (moveDef === 'slide_orthogonal_plus_diag_step') {
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          const nr = r + dr
          const nc = c + dc
          if (!inBounds(nr, nc)) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) {
            moves.push({ from: pos, to: idx })
          }
        }
      }
    } else if (moveDef === 'slide_diagonal' || moveDef === 'slide_diagonal_plus_orth_step') {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        for (let dist = 1; dist < config.rows; dist++) {
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
      if (moveDef === 'slide_diagonal_plus_orth_step') {
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nr = r + dr
          const nc = c + dc
          if (!inBounds(nr, nc)) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) {
            moves.push({ from: pos, to: idx })
          }
        }
      }
    } else if (moveDef === 'slide_forward') {
      const dr = playerIndex === 0 ? -1 : 1
      for (let dist = 1; dist < config.rows; dist++) {
        const nr = r + dr * dist
        if (!inBounds(nr, c)) break
        const idx = cellIndex(nr, c)
        if (board[idx] !== null) {
          if (board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
          break
        }
        moves.push({ from: pos, to: idx })
      }
    } else if (Array.isArray(moveDef)) {
      const dirs = flipDirs(moveDef, playerIndex)
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (!inBounds(nr, nc)) continue
        const idx = cellIndex(nr, nc)
        if (board[idx] === null || board[idx].owner !== playerIndex) {
          moves.push({ from: pos, to: idx })
        }
      }
    }

    return moves
  }

  function generateDropMoves(board, hand, playerIndex) {
    const moves = []
    const uniqueTypes = [...new Set(hand)]

    for (const type of uniqueTypes) {
      for (let i = 0; i < board.length; i++) {
        if (board[i] !== null) continue

        if (config.dropPawnFileLimit && type === 'pawn') {
          const [, col] = rowCol(i)
          const hasPawnInFile = board.some((cell, idx) => {
            if (!cell || cell.owner !== playerIndex || cell.type !== 'pawn') return false
            const [, cellCol] = rowCol(idx)
            return cellCol === col
          })
          if (hasPawnInFile) continue
        }

        const [row] = rowCol(i)
        const fwd = playerIndex === 0 ? -1 : 1
        if (type === 'pawn' || type === 'lance') {
          if (playerIndex === 0 && row === 0) continue
          if (playerIndex === 1 && row === config.rows - 1) continue
        }
        if (type === 'knight') {
          if (playerIndex === 0 && row <= 1) continue
          if (playerIndex === 1 && row >= config.rows - 2) continue
        }

        moves.push({ action: 'drop', type, to: i })
      }
    }

    return moves
  }

  function findKing(board, playerIndex) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === playerIndex && board[i].type === 'king') return i
    }
    return -1
  }

  function isInCheck(board, playerIndex) {
    const kingPos = findKing(board, playerIndex)
    if (kingPos === -1) return true
    const opponent = 1 - playerIndex
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].owner !== opponent) continue
      const attacks = generatePieceMoves(board, i, board[i], opponent)
      if (attacks.some(m => m.to === kingPos)) return true
    }
    return false
  }

  return {
    sliceName: 'shogi',
    pieceTypes: ['king', 'rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'],
    vocabulary: {
      king: { symbols: { 0: 'K', 1: 'k' } },
      rook: { symbols: { 0: 'R', 1: 'r' } },
      bishop: { symbols: { 0: 'B', 1: 'b' } },
      gold: { symbols: { 0: 'G', 1: 'g' } },
      silver: { symbols: { 0: 'S', 1: 's' } },
      knight: { symbols: { 0: 'N', 1: 'n' } },
      lance: { symbols: { 0: 'L', 1: 'l' } },
      pawn: { symbols: { 0: 'P', 1: 'p' } },
    },
    config,
    rules: ['capture.recruit', 'promotion.zone', 'check', 'checkmate'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      const setup = pluginConfig.setup || config.setup || null
      const board = setup ? parseSetup(setup) : buildDefaultBoard()
      return {
        board,
        hands: [[], []],
        _cols: config.cols,
      }
    },

    validateMove(move, slice, full) {
      const legal = this.getLegalMoves(slice, full)
      if (move.action === 'drop') {
        return legal.some(m => m.action === 'drop' && m.type === move.type && m.to === move.to)
      }
      return legal.some(m => m.from === move.from && m.to === move.to && !!m.promote === !!move.promote)
    },

    applyMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex
      const board = slice.board.map(c => c ? { ...c } : null)
      const hands = [slice.hands[0].slice(), slice.hands[1].slice()]

      if (move.action === 'drop') {
        board[move.to] = { type: move.type, owner: playerIndex }
        const idx = hands[playerIndex].indexOf(move.type)
        if (idx !== -1) hands[playerIndex].splice(idx, 1)
        return { ...slice, board, hands }
      }

      const piece = board[move.from]
      const captured = board[move.to]

      board[move.from] = null

      if (captured) {
        const demoted = getDemotedType(captured.type)
        if (demoted !== 'king') {
          hands[playerIndex].push(demoted)
        }
      }

      let newType = piece.type
      if (move.promote) {
        const promoted = getPromotedType(piece.type)
        if (promoted) newType = promoted
      }

      board[move.to] = { type: newType, owner: playerIndex }

      return { ...slice, board, hands }
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex
      const allMoves = []

      for (let i = 0; i < slice.board.length; i++) {
        const piece = slice.board[i]
        if (!piece || piece.owner !== playerIndex) continue
        const pieceMoves = generatePieceMoves(slice.board, i, piece, playerIndex)

        for (const m of pieceMoves) {
          const [fromRow] = rowCol(m.from)
          const [toRow] = rowCol(m.to)
          const canPromote = isInPromotionZone(toRow, playerIndex) || isInPromotionZone(fromRow, playerIndex)
          const promotedType = getPromotedType(piece.type)

          if (canPromote && promotedType) {
            allMoves.push({ ...m, promote: true })
            const fwd = playerIndex === 0 ? -1 : 1
            const mustPromote = (piece.type === 'pawn' || piece.type === 'lance') &&
              ((playerIndex === 0 && toRow === 0) || (playerIndex === 1 && toRow === config.rows - 1))
            const mustPromoteKnight = piece.type === 'knight' &&
              ((playerIndex === 0 && toRow <= 1) || (playerIndex === 1 && toRow >= config.rows - 2))
            if (!mustPromote && !mustPromoteKnight) {
              allMoves.push(m)
            }
          } else {
            allMoves.push(m)
          }
        }
      }

      const drops = generateDropMoves(slice.board, slice.hands[playerIndex], playerIndex)
      allMoves.push(...drops)

      return allMoves.filter(m => {
        const testBoard = slice.board.map(c => c ? { ...c } : null)
        if (m.action === 'drop') {
          testBoard[m.to] = { type: m.type, owner: playerIndex }
        } else {
          testBoard[m.to] = testBoard[m.from]
          testBoard[m.from] = null
          if (m.promote) {
            testBoard[m.to] = { ...testBoard[m.to], type: getPromotedType(testBoard[m.to].type) || testBoard[m.to].type }
          }
        }
        return !isInCheck(testBoard, playerIndex)
      })
    },

    checkWin(slice, full) {
      const playerIndex = full.__players.currentIndex
      const opponent = 1 - playerIndex

      if (findKing(slice.board, opponent) === -1) return playerIndex === 0 ? 'player1' : 'player2'

      if (isInCheck(slice.board, opponent)) {
        const oppFull = { __players: { currentIndex: opponent } }
        const oppMoves = this.getLegalMoves(slice, oppFull)
        if (oppMoves.length === 0) return playerIndex === 0 ? 'player1' : 'player2'
      }

      return null
    },
  }

  function buildDefaultBoard() {
    return new Array(config.rows * config.cols).fill(null)
  }

  function parseSetup(setup) {
    if (Array.isArray(setup)) return setup
    return new Array(config.rows * config.cols).fill(null)
  }
}
