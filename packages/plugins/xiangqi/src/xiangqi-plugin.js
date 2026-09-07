import { warnUnknownConfigKeys } from '../../../core/index.js'
import { fromConfig } from '../../../piece-behaviour/index.js'
// Every config key this plugin reads. Exported so the corpus guard and the
// authoring docs share one source of truth, and kept separate from `defaults`,
// which only lists the keys that carry a default value.
export const CONFIG_KEYS = new Set([
  'advancement', 'cannonJumpToMove', 'cols', 'flyingGeneralRule', 'hasRiver', 'palace',
  'passAllowed', 'pieceMoves', 'playerCount', 'promotionZone', 'river', 'rows', 'royalType',
  'bikjangDraw', 'firstMoveRows', 'palaceDiagonals', 'pawnAdvanceWin', 'setup', 'turnLogic', 'vocabulary', 'winCondition',
])


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

  warnUnknownConfigKeys('xiangqi', variantConfig, CONFIG_KEYS)

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

  const DEFAULT_PIECE_MOVES = {
    general: { type: 'rider', dirs: 'orthogonal', maxSteps: 1, constraint: 'palace' },
    advisor: { type: 'rider', dirs: 'diagonal', maxSteps: 1, constraint: 'palace' },
    elephant: { type: 'leaper', offsets: 'elephant', lame: 'half', constraint: 'own-side' },
    horse: { type: 'leaper', offsets: 'knight', lame: 'orthogonal' },
    chariot: { type: 'rider', dirs: 'orthogonal' },
    cannon: config.cannonJumpToMove
      ? { type: 'hopper', dirs: 'orthogonal', moveSlide: true }
      : { divergent: { move: { type: 'rider', dirs: 'orthogonal' }, capture: { type: 'hopper', dirs: 'orthogonal', captureSlide: true } } },
    soldier: null,
  }

  const PIECE_MOVES = config.pieceMoves
    ? { ...DEFAULT_PIECE_MOVES, ...config.pieceMoves }
    : DEFAULT_PIECE_MOVES

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

  const builtPieces = new Map()

  function buildPieceForType(type) {
    if (builtPieces.has(type)) return builtPieces.get(type)
    const spec = PIECE_MOVES[type]
    if (!spec) { builtPieces.set(type, null); return null }
    const { constraint, ...pureSpec } = spec
    const primitive = fromConfig(pureSpec)
    builtPieces.set(type, primitive)
    return primitive
  }

  function getConstraint(type) {
    const spec = PIECE_MOVES[type]
    return spec ? spec.constraint || null : null
  }

  function buildViewBoard(board, playerIndex) {
    return board.map(cell => {
      if (cell === null) return null
      return { friendly: cell.owner === playerIndex, enemy: cell.owner !== playerIndex, ...cell }
    })
  }

  function buildInternalTopology() {
    return {
      rays(from, directions, maxSteps) {
        const DIRS = {
          orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
          diagonal: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
          all: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
        }
        const resolved = typeof directions === 'string' ? (DIRS[directions] || []) : directions
        return resolved.map(([dr, dc]) => {
          const ray = []
          const [r, c] = rowCol(from)
          const limit = maxSteps || Math.max(config.rows, config.cols)
          for (let i = 1; i <= limit; i++) {
            const nr = r + dr * i, nc = c + dc * i
            if (!inBounds(nr, nc)) break
            ray.push(cellIndex(nr, nc))
          }
          return ray
        })
      },
      leapTargets(from, offsets) {
        const [r, c] = rowCol(from)
        const targets = []
        for (const [dr, dc] of offsets) {
          const nr = r + dr, nc = c + dc
          if (inBounds(nr, nc)) targets.push(cellIndex(nr, nc))
        }
        return targets
      },
    }
  }

  function generateSoldierMoves(board, pos, playerIndex) {
    const [r, c] = rowCol(pos)
    const moves = []
    const advancement = config.advancement
      ? config.advancement[playerIndex]
      : (playerIndex === 0 ? -1 : 1)
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
    return moves
  }

  // Quang Trung's Pawn moves and captures one square diagonally forward, and on
  // its first move only may advance two squares straight. "First move" is read
  // from the rank it starts on, the way a chess pawn's double step is.
  function firstMoveExtras(board, pos, piece, playerIndex) {
    const spec = PIECE_MOVES[piece.type]
    if (!spec || !spec.firstMove || !config.firstMoveRows) return []
    const [r] = rowCol(pos)
    if (r !== config.firstMoveRows[playerIndex]) return []
    const primitive = fromConfig(spec.firstMove)
    if (!primitive) return []
    const topo = topology || buildInternalTopology()
    return primitive.genMoves(topo, pos, buildViewBoard(board, playerIndex))
      .filter(m => !board[m.to])
  }

  function generatePieceMoves(board, pos, piece, playerIndex) {
    if (piece.type === 'soldier' && !PIECE_MOVES[piece.type]) {
      return generateSoldierMoves(board, pos, playerIndex)
    }

    const primitive = buildPieceForType(piece.type)
    if (!primitive) {
      if (piece.type === 'soldier') return generateSoldierMoves(board, pos, playerIndex)
      return []
    }

    const topo = topology || buildInternalTopology()
    const viewBoard = buildViewBoard(board, playerIndex)
    const rawMoves = [
      ...primitive.genMoves(topo, pos, viewBoard),
      ...firstMoveExtras(board, pos, piece, playerIndex),
    ]

    const constraint = getConstraint(piece.type)
    const drawn = rawMoves.filter(m => {
      const [fr, fc] = rowCol(m.from)
      const [tr, tc] = rowCol(m.to)
      return diagonalStepAllowed(fr, fc, tr, tc)
    })
    // A locust capture takes the piece it jumped, which is not the square it
    // landed on, so the move has to carry it. Dropping it moved the piece and
    // left the victim standing.
    const carry = (m) => (m.captured !== undefined ? { from: m.from, to: m.to, captured: m.captured } : { from: m.from, to: m.to })
    if (!constraint) return drawn.map(carry)

    return drawn
      .filter(m => {
        const [tr, tc] = rowCol(m.to)
        if (constraint === 'palace') return inPalace(tr, tc, playerIndex)
        if (constraint === 'own-side' && config.hasRiver) return !acrossRiver(tr, playerIndex)
        // Quang Trung confines its General and Pawns to the middle files at all
        // times, which is a property of the board rather than of the piece.
        if (constraint && constraint.cols) return tc >= constraint.cols[0] && tc <= constraint.cols[1]
        return true
      })
      .map(carry)
  }

  // Janggi draws an X in each palace and a piece may only move diagonally along
  // a line that is drawn - so the diagonals run between the palace's centre and
  // its four corners, and nowhere else. A step from a palace edge-midpoint to a
  // corner is diagonal, inside the palace, and not on any line.
  //
  // The same question Alquerque asked of the grid: what a board draws is what a
  // piece may walk.
  function palaceCentre(playerIndex) {
    const [lo, hi] = palace.rows[playerIndex]
    return [Math.round((lo + hi) / 2), Math.round((palace.cols[0] + palace.cols[1]) / 2)]
  }

  function isPalaceCorner(r, c, playerIndex) {
    const [lo, hi] = palace.rows[playerIndex]
    return (r === lo || r === hi) && (c === palace.cols[0] || c === palace.cols[1])
  }

  function onPalaceDiagonal(fr, fc, tr, tc) {
    for (const seat of [0, 1]) {
      const [cr, cc] = palaceCentre(seat)
      const fromCentre = fr === cr && fc === cc
      const toCentre = tr === cr && tc === cc
      if (fromCentre && isPalaceCorner(tr, tc, seat)) return true
      if (toCentre && isPalaceCorner(fr, fc, seat)) return true
      // A Chariot runs the whole diagonal, corner through centre to the corner
      // opposite. Checking only the endpoints against the centre rejected the
      // one move on the palace X that is longer than a step.
      if (isPalaceCorner(fr, fc, seat) && isPalaceCorner(tr, tc, seat)
        && fr !== tr && fc !== tc) return true
    }
    return false
  }

  function diagonalStepAllowed(fr, fc, tr, tc) {
    if (!config.palaceDiagonals) return true
    // Only a true diagonal is a diagonal. A Horse's (2,1) and an Elephant's
    // (3,2) change both row and column and are not moves along a diagonal line,
    // so testing "both changed" took the Elephant's whole move set away.
    if (Math.abs(fr - tr) !== Math.abs(fc - tc)) return true
    return onPalaceDiagonal(fr, fc, tr, tc)
  }

  const royalType = config.royalType || 'general'

  function findGeneral(board, playerIndex) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === playerIndex && board[i].type === royalType) return i
    }
    return -1
  }

  // Whether the two Generals stand on the same file with nothing between them.
  // In Xiangqi that position is illegal; in Janggi it is bikjang, and the player
  // to move may end the game as a draw by passing rather than breaking it.
  function generalsFacing(board) {
    const g0 = findGeneral(board, 0)
    const g1 = findGeneral(board, 1)
    if (g0 === -1 || g1 === -1) return false
    const [r0, c0] = rowCol(g0)
    const [r1, c1] = rowCol(g1)
    if (c0 !== c1) return false
    for (let r = Math.min(r0, r1) + 1; r < Math.max(r0, r1); r++) {
      if (board[cellIndex(r, c0)] !== null) return false
    }
    return true
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

  function canAttack(board, from, target, piece, playerIndex) {
    if (piece.type === 'soldier' && !PIECE_MOVES[piece.type]) {
      return generateSoldierMoves(board, from, playerIndex).some(m => m.to === target)
    }

    const primitive = buildPieceForType(piece.type)
    if (!primitive) {
      if (piece.type === 'soldier') {
        return generateSoldierMoves(board, from, playerIndex).some(m => m.to === target)
      }
      return false
    }

    const constraint = getConstraint(piece.type)
    if (constraint) {
      const [tr, tc] = rowCol(target)
      if (constraint === 'palace' && !inPalace(tr, tc, playerIndex)) return false
      if (constraint === 'own-side' && config.hasRiver && acrossRiver(tr, playerIndex)) return false
    }

    const topo = topology || buildInternalTopology()
    return primitive.attacks(topo, from, target, board)
  }

  function isInCheck(board, playerIndex) {
    const genPos = findGeneral(board, playerIndex)
    if (genPos === -1) return true
    const opponent = 1 - playerIndex
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].owner !== opponent) continue
      if (canAttack(board, i, genPos, board[i], opponent)) return true
    }
    if (violatesFlyingGeneral(board)) return true
    return false
  }

  function boardFromSetup(setup) {
    const empty = () => new Array(config.rows * config.cols).fill(null)
    if (!setup) return empty()
    if (Array.isArray(setup)) return setup
    if (topology && topology.parsePosition) return topology.parsePosition(setup, VOCABULARY)
    return empty()
  }

  return {
    sliceName: 'xiangqi',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: Object.keys(VOCABULARY),
    vocabulary: VOCABULARY,
    config,
    rules: ['constraint.region', 'capture.screen-jump', 'constraint.facing', 'check', 'checkmate'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      if (topology) {
        if (topology.rows) config.rows = topology.rows
        if (topology.cols) config.cols = topology.cols
      }
      const setup = pluginConfig.setup || config.setup || null
      const board = boardFromSetup(setup)

      for (let i = 0; i < board.length; i++) {
        if (board[i] && board[i].type !== 'soldier' && !PIECE_MOVES[board[i].type]) {
          throw new Error(`Unmapped piece type "${board[i].type}" at cell ${i}. Declare its movement in pieceMoves or remove it from setup.`)
        }
      }

      for (const [type, def] of Object.entries(VOCABULARY)) {
        const owners = def.symbols ? Object.keys(def.symbols) : []
        const hasPlayerOwner = owners.some(o => o === '0' || o === '1')
        if (hasPlayerOwner && type !== 'soldier' && !PIECE_MOVES[type]) {
          throw new Error(`Vocabulary declares "${type}" but no matching entry in pieceMoves. Declare its movement or remove it from vocabulary.`)
        }
      }

      return { board, _cols: config.cols }
    },

    validateMove(move, slice, full) {
      if (config.passAllowed && move.action === 'pass') return true
      const legal = this.getLegalMoves(slice, full)
      return legal.some(m => m.from === move.from && m.to === move.to)
    },

    applyMove(move, slice, full) {
      // Passing while the Generals face is bikjang: the game ends there, drawn.
      if (move.action === 'pass') {
        return config.bikjangDraw ? { ...slice, _bikjang: generalsFacing(slice.board) } : slice
      }
      const board = [...slice.board]
      board[move.to] = board[move.from]
      board[move.from] = null
      if (move.captured !== undefined && move.captured !== null) board[move.captured] = null
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

      // In bikjang the player to move has exactly two choices: break it, or
      // pass and end the game drawn. A move that leaves the Generals facing is
      // neither, so it is not on offer.
      const inBikjang = config.bikjangDraw && generalsFacing(slice.board)

      return allMoves.filter(m => {
        if (m.action === 'pass') return true
        const testBoard = [...slice.board]
        testBoard[m.to] = testBoard[m.from]
        testBoard[m.from] = null
        if (isInCheck(testBoard, playerIndex)) return false
        if (inBikjang && generalsFacing(testBoard)) return false
        return true
      })
    },

    checkWin(slice, full) {
      const playerIndex = full.__players.currentIndex
      const opponent = 1 - playerIndex

      // Bikjang. A pass offered while the Generals face each other on an open
      // file ends the game immediately, drawn.
      if (config.bikjangDraw && slice._bikjang) return 'draw'

      // "A Pawn reaches the opponent's last rank in such a position that it
      // cannot be immediately captured on the opponent's next move. This
      // automatically wins the game."
      if (config.pawnAdvanceWin) {
        for (const seat of [0, 1]) {
          const lastRank = seat === 0 ? 0 : config.rows - 1
          const foe = 1 - seat
          for (let c = 0; c < config.cols; c++) {
            const idx = cellIndex(lastRank, c)
            const cell = slice.board[idx]
            if (!cell || cell.owner !== seat || cell.type !== config.pawnAdvanceWin) continue
            const capturable = slice.board.some((other, i) =>
              other && other.owner === foe && canAttack(slice.board, i, idx, other, foe))
            if (!capturable) return seat
          }
        }
      }

      if (findGeneral(slice.board, opponent) === -1) {
        return playerIndex
      }

      if (isInCheck(slice.board, opponent)) {
        const oppFull = { __players: { currentIndex: opponent } }
        const oppMoves = this.getLegalMoves(slice, oppFull)
        if (oppMoves.length === 0) return playerIndex
      }

      return null
    },
  }
}

createXiangqiPlugin.configKeys = CONFIG_KEYS
createXiangqiPlugin.interaction = 'move'
