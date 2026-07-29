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

  const palace = config.palace || {
    cols: [3, 5],
    rows: [[config.rows - 3, config.rows - 1], [0, 2]],
  }
  const riverRow = config.river != null ? config.river : Math.floor(config.rows / 2)

  let topology = null

  const DEFAULT_VOCABULARY = {
    general: { symbols: { 0: 'K', 1: 'k' } },
    advisor: { symbols: { 0: 'A', 1: 'a' } },
    elephant: { symbols: { 0: 'E', 1: 'e' } },
    horse: { symbols: { 0: 'H', 1: 'h' } },
    chariot: { symbols: { 0: 'R', 1: 'r' } },
    cannon: { symbols: { 0: 'C', 1: 'c' } },
    soldier: { symbols: { 0: 'P', 1: 'p' } },
  }

  const VOCABULARY = config.vocabulary || DEFAULT_VOCABULARY

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
    if (c < palace.cols[0] || c > palace.cols[1]) return false
    const [lo, hi] = palace.rows[playerIndex]
    return r >= lo && r <= hi
  }

  function acrossRiver(r, playerIndex) {
    if (playerIndex === 0) return r < riverRow
    return r >= riverRow
  }

  const ORTHOGONAL = [[0, 1], [0, -1], [1, 0], [-1, 0]]
  const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  const KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]]
  const ELEPHANT_OFFSETS = [[-2, -2], [-2, 2], [2, -2], [2, 2]]

  const PIECE_DEFS = config.pieces || {
    general: { movement: 'step', dirs: ORTHOGONAL, constraint: 'palace' },
    advisor: { movement: 'step', dirs: DIAGONAL, constraint: 'palace' },
    elephant: { movement: 'blocked-leap', dirs: ELEPHANT_OFFSETS, constraint: 'own-side', blockAt: 0.5 },
    horse: { movement: 'blocked-knight', dirs: KNIGHT_OFFSETS },
    chariot: { movement: 'slide', dirs: ORTHOGONAL },
    cannon: { movement: 'cannon', dirs: ORTHOGONAL },
    soldier: { movement: 'soldier' },
  }

  function generatePieceMoves(board, pos, piece, playerIndex) {
    const def = PIECE_DEFS[piece.type]
    if (!def) return []
    const [r, c] = rowCol(pos)
    const moves = []
    const advancement = config.advancement
      ? config.advancement[playerIndex]
      : (playerIndex === 0 ? -1 : 1)

    switch (def.movement) {
      case 'step': {
        for (const [dr, dc] of def.dirs) {
          const nr = r + dr, nc = c + dc
          if (!inBounds(nr, nc)) continue
          if (def.constraint === 'palace' && !inPalace(nr, nc, playerIndex)) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
        }
        break
      }
      case 'blocked-leap': {
        for (const [dr, dc] of def.dirs) {
          const nr = r + dr, nc = c + dc
          if (!inBounds(nr, nc)) continue
          if (def.constraint === 'own-side' && config.hasRiver && acrossRiver(nr, playerIndex)) continue
          const blockR = r + Math.round(dr * def.blockAt)
          const blockC = c + Math.round(dc * def.blockAt)
          if (board[cellIndex(blockR, blockC)] !== null) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
        }
        break
      }
      case 'blocked-knight': {
        for (const [dr, dc] of def.dirs) {
          const nr = r + dr, nc = c + dc
          if (!inBounds(nr, nc)) continue
          const legBlock = Math.abs(dr) > Math.abs(dc)
            ? cellIndex(r + (dr > 0 ? 1 : -1), c)
            : cellIndex(r, c + (dc > 0 ? 1 : -1))
          if (board[legBlock] !== null) continue
          const idx = cellIndex(nr, nc)
          if (board[idx] === null || board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
        }
        break
      }
      case 'slide': {
        for (const [dr, dc] of def.dirs) {
          for (let dist = 1; dist < Math.max(config.rows, config.cols); dist++) {
            const nr = r + dr * dist, nc = c + dc * dist
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
        for (const [dr, dc] of def.dirs) {
          let foundScreen = false
          for (let dist = 1; dist < Math.max(config.rows, config.cols); dist++) {
            const nr = r + dr * dist, nc = c + dc * dist
            if (!inBounds(nr, nc)) break
            const idx = cellIndex(nr, nc)
            if (!foundScreen) {
              if (board[idx] !== null) { foundScreen = true }
              else if (!config.cannonJumpToMove) moves.push({ from: pos, to: idx })
            } else {
              if (board[idx] !== null) {
                if (board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
                break
              }
              if (config.cannonJumpToMove) moves.push({ from: pos, to: idx })
            }
          }
        }
        break
      }
      case 'soldier': {
        const nr = r + advancement
        if (inBounds(nr, c)) {
          const idx = cellIndex(nr, c)
          if (board[idx] === null || board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
        }
        if (acrossRiver(r, playerIndex)) {
          for (const dc of [-1, 1]) {
            if (!inBounds(r, c + dc)) continue
            const idx = cellIndex(r, c + dc)
            if (board[idx] === null || board[idx].owner !== playerIndex) moves.push({ from: pos, to: idx })
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

  // The starting position comes from the variant's frontmatter in
  // moddable-rules, the same string the published board diagram is drawn from.
  function boardFromSetup(setup) {
    const empty = () => new Array(config.rows * config.cols).fill(null)
    if (!setup) return empty()
    if (Array.isArray(setup)) return setup
    if (topology && topology.parsePosition) return topology.parsePosition(setup, VOCABULARY)
    return empty()
  }

  return {
    sliceName: 'xiangqi',
    pieceTypes: ['general', 'advisor', 'elephant', 'horse', 'chariot', 'cannon', 'soldier'],
    vocabulary: VOCABULARY,
    config,
    rules: ['constraint.region', 'capture.screen-jump', 'constraint.facing', 'check', 'checkmate'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      const setup = pluginConfig.setup || config.setup || null
      return { board: boardFromSetup(setup), _cols: config.cols }
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
