import { warnUnknownConfigKeys } from '../../../core/index.js'
// Every config key this plugin reads. Exported so the corpus guard and the
// authoring docs share one source of truth, and kept separate from `defaults`,
// which only lists the keys that carry a default value.
export const CONFIG_KEYS = new Set([
  'captureBackward', 'captureDirections', 'cols', 'directions', 'flyingKings', 'forcedCapture',
  'kingMoveLimit',
  'kingCapturePriority', 'kingLandsBehindCapture', 'loseOnSinglePiece', 'majorityPrefersKing',
  'manCapture', 'manMove',
  'maximalCapture', 'menCannotCaptureKings', 'piecesPerPlayer', 'playerCount',
  'promotion', 'promotionDuring', 'removeImmediately', 'rows', 'setup', 'turnLogic', 'winCondition',
])

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
    kingLandsBehindCapture: false,
    removeImmediately: true,
    playerNames: null,
  }

  const config = { ...defaults, ...variantConfig }

  warnUnknownConfigKeys('draughts', variantConfig, CONFIG_KEYS)

  const hooks = {
    moveFilter: (moves) => moves,
    winCondition: null,
    ...config.hooks,
  }

  function winnerName(playerIndex) {
    return playerIndex
  }

  let topology = null

  const DEFAULT_VOCABULARY = {
    man: { symbols: { 0: 'w', 1: 'b' } },
    king: { symbols: { 0: 'W', 1: 'B' } },
  }

  const VOCABULARY = config.vocabulary || DEFAULT_VOCABULARY

  function cellIndex(row, col) {
    return row * config.cols + col
  }

  function rowCol(idx) {
    return [Math.floor(idx / config.cols), idx % config.cols]
  }

  function isPlayable(row, col) {
    if (config.directions !== 'diagonal') return true
    return (row + col) % 2 === 1
  }

  function forwardDirs(playerIndex) {
    const fwd = playerIndex === 0 ? -1 : 1
    if (config.directions === 'orthogonal') {
      return [[fwd, 0], [0, -1], [0, 1]]
    }
    // Alquerque's lines run both ways at once, so forward is every direction
    // that is not straight backwards.
    if (config.directions === 'all') {
      return [[fwd, 0], [0, -1], [0, 1], [fwd, -1], [fwd, 1]]
    }
    return [[fwd, -1], [fwd, 1]]
  }

  function backwardDirs(playerIndex) {
    const bwd = playerIndex === 0 ? 1 : -1
    if (config.directions === 'orthogonal') return [[bwd, 0]]
    if (config.directions === 'all') return [[bwd, 0], [bwd, -1], [bwd, 1]]
    return [[bwd, -1], [bwd, 1]]
  }

  const ORTHOGONAL_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  const DIAGONAL_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

  // Frisian moves on the diagonals and captures on all eight, so the direction
  // a piece may travel and the direction it may take on are two questions. Every
  // other variant answers them the same way, which is why one table did.
  function dirSetFor(which) {
    if (which === 'orthogonal') return ORTHOGONAL_DIRS
    if (which === 'all') return [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS]
    return DIAGONAL_DIRS
  }

  function captureDirs() {
    return dirSetFor(config.captureDirections || config.directions)
  }

  function allDirs() {
    if (config.directions === 'orthogonal') return ORTHOGONAL_DIRS
    // An Alquerque board draws both, and which of them exist at a given point
    // is the topology's answer, not this table's.
    if (config.directions === 'all') return [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS]
    return DIAGONAL_DIRS
  }

  function inBounds(r, c) {
    return r >= 0 && r < config.rows && c >= 0 && c < config.cols
  }

  // Whether the board draws a line in this direction from this square.
  //
  // Every ordinary draughts board draws all four diagonals at every square, so
  // this is true everywhere and the plugin's own arithmetic was right by
  // accident. An Alquerque board draws its diagonals corner to corner and
  // midpoint to midpoint, which leaves half its points with four and half with
  // none, and a piece may only move along a line that is drawn (engine#161).
  //
  // The topology is what knows, because the topology is what the board is
  // drawn from - asking it is what keeps the played board and the drawn board
  // the same board.
  function directionAvailable(from, dr, dc) {
    if (!topology || !topology.step) return true
    return topology.step(from, [dr, dc]) !== null
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
      return captureDirs()
    }
    if (config.manCapture === 'all' || config.captureBackward) {
      return captureDirs()
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

  // What a capture sequence is worth. Counting pieces is the ordinary answer and
  // the default; Frisian weighs them, and not linearly:
  //
  //   "A king is worth more than a man, but less than two men."
  //   1 king = 1.5 men, 2 kings = 3.5, 3 kings = 5.5, i.e. 2n - 0.5
  //
  // so two men and a king (3.5) beats three men (3).
  // Frisian's three-move king limit. "While a player still has at least one man,
  // the same king may not make more than three consecutive non-capturing moves."
  // The king is released by capturing, or by its owner moving anything else, and
  // a player down to kings alone is not restricted at all.
  //
  // The counter is kept per seat as the square the king now stands on and how
  // many quiet moves it has strung together, so it survives the king moving and
  // dies the moment another piece does.
  function applyKingMoveLimit(moves, slice, playerIndex) {
    const limit = config.kingMoveLimit
    if (!limit) return moves
    const streak = (slice._kingStreak || [])[playerIndex]
    if (!streak || streak.count < limit) return moves
    const hasMan = slice.board.some(p => p && p.owner === playerIndex && p.type === 'man')
    if (!hasMan) return moves
    return moves.filter(m => m.from !== streak.at)
  }

  function captureValue(board) {
    if (config.maximalCapture !== 'weighted') return (capture) => capture.captureCount
    return (capture) => {
      let kings = 0
      let men = 0
      for (const index of capture.captures || []) {
        const piece = board[index]
        if (piece && piece.type === 'king') kings++
        else men++
      }
      return men + (kings > 0 ? 2 * kings - 0.5 : 0)
    }
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
        if (!directionAvailable(i, dr, dc)) continue
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
      if (!directionAvailable(pos, dr, dc)) continue
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
          // `removeImmediately: false` means a captured piece stays on the
          // board until the whole chain ends, so it blocks the rest of the
          // chain - a flying king may not pass back over a piece it has
          // already taken. International draughts declares it and nothing read
          // it: the square was emptied here, so the `alreadyCaptured` guard
          // below could never fire, because the piece it was looking for was
          // gone. The declaration was inert and every variant played as if it
          // were true.
          if (config.removeImmediately !== false) tempBoard[enemyPos] = null
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

          // A flying king normally chooses any empty square beyond the piece
          // it took. Thai draughts (Makhos) is the exception: Wikipedia's
          // Draughts article describes "Thai checkers, which has a king that
          // can only land on the vacant square immediately beyond a captured
          // piece". The king still FLIES to reach the capture - the
          // restriction is on where it comes to rest - so this cannot be
          // expressed by turning `flyingKings` off (engine#161).
          if (piece.type !== 'king' || !config.flyingKings || config.kingLandsBehindCapture) break
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
    // Alquerque has no kings at all: "There are no kings in Alquerque", and a
    // man reaching the far row is just a man on the far row.
    if (config.promotion === false) return false
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

  // The starting position is content, not code: it lives in the variant's
  // frontmatter in moddable-rules and is the same string the board diagram is
  // drawn from. Parsing it through topology.parsePosition means the played
  // board and the published diagram cannot drift apart. buildSetupBoard below
  // is retained only for callers that supply no setup at all.
  function boardFromSetup(setup) {
    if (!setup) return buildSetupBoard()
    if (Array.isArray(setup)) return setup
    if (topology && topology.parsePosition) {
      return topology.parsePosition(setup, VOCABULARY)
    }
    return buildSetupBoard()
  }

  function capturesAKing(move, board) {
    const captured = move.captures || move.captured || []
    return captured.some(pos => {
      const piece = board[pos]
      return piece && piece.type === 'king'
    })
  }

  return {
    sliceName: 'draughts',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['man', 'king'],
    vocabulary: VOCABULARY,
    config,
    rules: ['capture.replacement', 'forced-capture', 'chain-capture', 'promotion.rank-reach'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      if (topology) {
        if (topology.rows) config.rows = topology.rows
        if (topology.cols) config.cols = topology.cols
      }
      const setup = pluginConfig.setup || config.setup || null
      return {
        board: boardFromSetup(setup),
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

      if (config.kingMoveLimit) {
        const streaks = (slice._kingStreak || [null, null]).slice()
        const quiet = !move.captures || move.captures.length === 0
        if (quiet && landingPiece.type === 'king') {
          const previous = streaks[playerIndex]
          streaks[playerIndex] = previous && previous.at === move.from
            ? { at: move.to, count: previous.count + 1 }
            : { at: move.to, count: 1 }
        } else {
          streaks[playerIndex] = null
        }
        slice = { ...slice, _kingStreak: streaks }
      }

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
        return hooks.moveFilter(findCaptures(slice.board, playerIndex, slice._chainFrom), slice, full)
      }

      let captures = findCaptures(slice.board, playerIndex)

      if (config.menCannotCaptureKings) {
        captures = captures.filter(c => !capturesAKing(c, slice.board))
      }

      if (config.kingCapturePriority && captures.length > 0) {
        const kingCaptures = captures.filter(c => {
          const piece = slice.board[c.from]
          return piece && piece.type === 'king'
        })
        if (kingCaptures.length > 0) captures = kingCaptures
      }

      if (config.forcedCapture && captures.length > 0) {
        if (config.maximalCapture) {
          const value = captureValue(slice.board)
          const best = Math.max(...captures.map(value))
          captures = captures.filter(c => value(c) >= best)

          if (config.majorityPrefersKing) {
            const withKing = captures.filter(c => {
              const piece = slice.board[c.from]
              return piece && piece.type === 'king'
            })
            if (withKing.length > 0) captures = withKing
          }
        }
        return hooks.moveFilter(captures, slice, full)
      }

      const simpleMoves = applyKingMoveLimit(findSimpleMoves(slice.board, playerIndex), slice, playerIndex)
      return hooks.moveFilter([...captures, ...simpleMoves], slice, full)
    },

    checkWin(slice, full) {
      const playerIndex = full.__players.currentIndex
      const opponent = 1 - playerIndex

      if (typeof hooks.winCondition === 'function') {
        const outcome = hooks.winCondition(slice, { currentPlayer: playerIndex, winnerName })
        if (outcome !== null && outcome !== undefined) return outcome
      }

      const opponentPieces = slice.board.filter(p => p && p.owner === opponent)
      if (opponentPieces.length === 0) {
        return winnerName(playerIndex)
      }

      if (config.loseOnSinglePiece && opponentPieces.length === 1) {
        return winnerName(playerIndex)
      }

      const opponentMoves = findCaptures(slice.board, opponent)
      if (opponentMoves.length === 0) {
        const opponentSimple = findSimpleMoves(slice.board, opponent)
        if (opponentSimple.length === 0) {
          return winnerName(playerIndex)
        }
      }

      return null
    },
  }
}

createDraughtsPlugin.configKeys = CONFIG_KEYS
createDraughtsPlugin.interaction = 'chain'
