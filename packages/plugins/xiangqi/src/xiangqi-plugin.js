import { warnUnknownConfigKeys } from '../../../core/index.js'
import { fromConfig } from '../../../piece-behaviour/index.js'
// Every config key this plugin reads. Exported so the corpus guard and the
// authoring docs share one source of truth, and kept separate from `defaults`,
// which only lists the keys that carry a default value.
export const CONFIG_KEYS = new Set([
  'advancement', 'cannonJumpToMove', 'cols', 'flyingGeneralRule', 'hasRiver', 'palace',
  'passAllowed', 'pieceMoves', 'playerCount', 'promotionZone', 'river', 'rows', 'royalType',
  'bikjangDraw', 'capture', 'covered', 'firstMoveRows', 'royal', 'palaceDiagonals', 'pawnAdvanceWin', 'setup', 'turnLogic', 'vocabulary', 'winCondition',
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

  // A declared piece that faces forward has to face the other way for the other
  // seat. The soldier generator was directional from the start and declared
  // pieces were not, so a variant could describe a piece that advances - and
  // both armies advanced the same way up the board.
  //
  // Same shape as the chess plugin's: the variant says `directional: true` and
  // the row component of every offset is mirrored for seat 1.
  function flipSpec(spec) {
    if (!spec || typeof spec !== 'object') return spec
    const out = { ...spec }
    if (Array.isArray(out.offsets)) out.offsets = out.offsets.map(([dr, dc]) => [-dr, dc])
    if (Array.isArray(out.dirs)) out.dirs = out.dirs.map(([dr, dc]) => [-dr, dc])
    if (out.divergent) {
      out.divergent = { move: flipSpec(out.divergent.move), capture: flipSpec(out.divergent.capture) }
    }
    if (out.firstMove) out.firstMove = flipSpec(out.firstMove)
    if (out.type === 'compose' && Array.isArray(out.parts)) out.parts = out.parts.map(flipSpec)
    return out
  }

  function buildPieceForType(type, playerIndex = 0) {
    const spec = PIECE_MOVES[type]
    if (!spec) return null
    const seatMatters = spec.directional === true
    const key = seatMatters ? `${type}__p${playerIndex}` : type
    if (builtPieces.has(key)) return builtPieces.get(key)
    const oriented = seatMatters && playerIndex === 1 ? flipSpec(spec) : spec
    const { constraint, directional, firstMove, ...pureSpec } = oriented
    const primitive = fromConfig(pureSpec)
    builtPieces.set(key, primitive)
    return primitive
  }

  function getConstraint(type) {
    const spec = PIECE_MOVES[type]
    return spec ? spec.constraint || null : null
  }

  // Jieqi and its relatives: a piece stands face down, and what it moves as is
  // not what it is.
  //
  // Every non-royal piece is shuffled across the squares those pieces normally
  // occupy, so the piece on a Chariot's home square is usually not a Chariot.
  // Until it moves it must move AS a Chariot - "a Jieqi piece should do the
  // first move as the original piece in which it is located"
  // (pychess.org/variants/jieqi) - and making that move turns it face up, after
  // which it moves as itself for the rest of the game.
  //
  // So a covered cell carries two types: `homeType`, which the square dictates
  // and both players can read off the board, and `type`, which is the truth and
  // which NEITHER player knows. The variant declares the arrangement rather
  // than the plugin assuming a Xiangqi array.
  const coveredSpec = config.covered || null
  const COVERED_TYPE = coveredSpec ? (coveredSpec.type || 'covered') : null
  const UNCONSTRAINED_WHEN_REVEALED = new Set(
    (coveredSpec && coveredSpec.unconstrainedWhenRevealed) || [])

  // A covered cell's `type` is the COVERED type, not the truth. That is
  // deliberate and it is the whole safety property: every generic consumer -
  // the FEN writer, the renderer, the piece counter - reads `type`, and each
  // of them must see a face-down piece. The truth lives in `trueType`, which
  // only this plugin and the store's projection know about.
  //
  // Storing it the other way round is what the first cut did, and `toFen`
  // published the entire hidden army in the opening position.
  // A cell is face down when its type says so, and nowhere else. It carried a
  // `covered: true` flag beside the type at first, and a board loaded from a
  // FEN had the type without the flag - so every rule written against the flag
  // silently stopped applying to a loaded position, and a face-down piece
  // could be captured.
  function isCovered(piece) {
    return !!piece && piece.type === COVERED_TYPE
  }

  function effectiveType(piece) {
    return isCovered(piece) && piece.homeType ? piece.homeType : piece.type
  }

  // A revealed Advisor or Elephant is freed from the palace and the river -
  // the one rule relaxation the variant makes, and only for a piece that has
  // been turned face up. A COVERED piece on an Advisor square is a "fake
  // Advisor" and is confined like one.
  function constraintFor(piece) {
    if (!isCovered(piece) && UNCONSTRAINED_WHEN_REVEALED.has(piece.type)) return null
    return getConstraint(effectiveType(piece))
  }

  // Banqi covers everything, and a face-down piece there has no COLOUR either:
  // all 32 pieces are shuffled onto the board and the first flip of the game
  // decides who commands which side. So a covered cell is owned by nobody
  // (owner -1, the same convention Duck Chess uses for its blocker) and the
  // truth it carries is a type AND a colour.
  const OWNERLESS = -1
  const coveredIsOwnerless = !!(coveredSpec && coveredSpec.ownerless)
  const flipIsAMove = !!(coveredSpec && coveredSpec.flip)
  const coveredCapturable = !coveredSpec || coveredSpec.capturable !== false

  // Which seat commands which colour. Null until the first flip settles it;
  // after that `colourSeat[colour]` is the seat that owns pieces of it.
  function seatOfColour(slice, colour) {
    const map = slice.colourSeat
    return map ? map[colour] : OWNERLESS
  }

  function shuffled(list, rng) {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = rng ? rng.nextInt(0, i) : i
      const swap = out[i]; out[i] = out[j]; out[j] = swap
    }
    return out
  }

  // Deal the true identities. The declared `setup` says WHICH squares are face
  // down; `covered.homeSetup` says what normally stands on each square. Both
  // are consumed - a setup that declared one and not the other would be the
  // silent-wrong-game case all over again.
  // Banqi's deal: a declared pool of pieces per colour, shuffled across every
  // covered square. There is no home array because there are no home squares -
  // nothing about the board tells you what stands on it.
  function dealFromPool(board, rng) {
    const squares = []
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].type === COVERED_TYPE) squares.push(i)
    }
    const bag = []
    for (const colour of [0, 1]) {
      for (const [type, count] of Object.entries(coveredSpec.pool)) {
        for (let n = 0; n < count; n++) bag.push({ type, colour })
      }
    }
    if (bag.length !== squares.length) {
      throw new Error(
        `covered.pool deals ${bag.length} pieces but the setup has ${squares.length} face-down squares.`)
    }
    const dealt = [...board]
    shuffled(bag, rng).forEach((piece, n) => {
      dealt[squares[n]] = {
        type: COVERED_TYPE,
        trueType: piece.type,
        trueColour: piece.colour,
        owner: OWNERLESS,
      }
    })
    return dealt
  }

  function dealCovered(board, rng) {
    if (coveredSpec.pool) return dealFromPool(board, rng)
    const home = boardFromSetup(coveredSpec.homeSetup)
    const byOwner = new Map()
    for (let i = 0; i < board.length; i++) {
      const cell = board[i]
      if (!cell || cell.type !== COVERED_TYPE) continue
      if (!home[i]) {
        throw new Error(`Cell ${i} is face down but covered.homeSetup puts nothing there - the two setups disagree.`)
      }
      if (!byOwner.has(cell.owner)) byOwner.set(cell.owner, [])
      byOwner.get(cell.owner).push(i)
    }
    const dealt = [...board]
    for (const [owner, cells] of byOwner) {
      const pool = shuffled(cells.map(i => home[i].type), rng)
      cells.forEach((cellIdx, n) => {
        dealt[cellIdx] = { type: COVERED_TYPE, trueType: pool[n], homeType: home[cellIdx].type, owner }
      })
    }
    return dealt
  }

  // Capture decided by comparing the two pieces rather than by asking how the
  // attacker moves. Banqi ranks its pieces and lets a piece take an equal or
  // lower one; Dou Shou Qi (#157) ranks eight animals the same way, which is
  // why this is declared rather than written into either.
  //
  // The order alone is never the whole rule - Banqi's Soldier takes the
  // General and the General may not take the Soldier - so the exceptions are
  // declared beside it and are checked first.
  const captureSpec = config.capture || null
  const rankOf = new Map()
  if (captureSpec && Array.isArray(captureSpec.order)) {
    captureSpec.order.forEach((type, i) => rankOf.set(type, captureSpec.order.length - i))
  }
  const unranked = new Set((captureSpec && captureSpec.unranked) || [])
  const pairKey = (a, v) => `${a}>${v}`
  const allowPairs = new Set(((captureSpec && captureSpec.allow) || []).map(([a, v]) => pairKey(a, v)))
  const denyPairs = new Set(((captureSpec && captureSpec.deny) || []).map(([a, v]) => pairKey(a, v)))

  function captureAllowed(attacker, victim) {
    if (!captureSpec || captureSpec.by !== 'rank') return true
    const a = attacker.type
    const v = victim.type
    if (denyPairs.has(pairKey(a, v))) return false
    if (allowPairs.has(pairKey(a, v))) return true
    // An unranked attacker takes anything; an unranked VICTIM can be taken by
    // anything, since it sits outside the order in both directions.
    if (unranked.has(a) || unranked.has(v)) return true
    const ar = rankOf.get(a)
    const vr = rankOf.get(v)
    if (ar === undefined || vr === undefined) return true
    return ar >= vr
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
    const oriented = spec.directional === true && playerIndex === 1
      ? flipSpec(spec.firstMove)
      : spec.firstMove
    const primitive = fromConfig(oriented)
    if (!primitive) return []
    const topo = topology || buildInternalTopology()
    return primitive.genMoves(topo, pos, buildViewBoard(board, playerIndex))
      .filter(m => !board[m.to])
  }

  function generatePieceMoves(board, pos, piece, playerIndex) {
    // What it moves as, which for a face-down piece is not what it is.
    const effType = effectiveType(piece)
    const asPiece = effType === piece.type ? piece : { ...piece, type: effType }

    if (effType === 'soldier' && !PIECE_MOVES[effType]) {
      return generateSoldierMoves(board, pos, playerIndex)
    }

    const primitive = buildPieceForType(effType, playerIndex)
    if (!primitive) {
      if (effType === 'soldier') return generateSoldierMoves(board, pos, playerIndex)
      return []
    }

    const topo = topology || buildInternalTopology()
    const viewBoard = buildViewBoard(board, playerIndex)
    const rawMoves = [
      ...primitive.genMoves(topo, pos, viewBoard),
      ...firstMoveExtras(board, pos, asPiece, playerIndex),
    ]

    const constraint = constraintFor(piece)
    const drawn = rawMoves.filter(m => {
      const [fr, fc] = rowCol(m.from)
      const [tr, tc] = rowCol(m.to)
      return diagonalStepAllowed(fr, fc, tr, tc)
    })
    // A locust capture takes the piece it jumped, which is not the square it
    // landed on, so the move has to carry it. Dropping it moved the piece and
    // left the victim standing.
    const carry = (m) => (m.captured !== undefined ? { from: m.from, to: m.to, captured: m.captured } : { from: m.from, to: m.to })

    // Whether a face-down piece can be taken is a rule the variant states, not
    // one to assume either way. Jieqi: "a covered piece may be captured by an
    // opponent's piece in the normal way." Banqi: "a face-down piece cannot be
    // captured or moved. It can only be flipped."
    const takeable = drawn.filter(m => {
      const victim = board[m.to]
      if (!victim) return true
      if (isCovered(victim)) return coveredCapturable
      return captureAllowed(piece, victim)
    })

    if (!constraint) return takeable.map(carry)

    return takeable
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

    const primitive = buildPieceForType(piece.type, playerIndex)
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

    // What a seat may see. A face-down piece's true identity is known to
    // NEITHER player - that is the variant, not a per-seat asymmetry - so the
    // projection drops `trueType` for every seat, leaving the covered `type`
    // and the `homeType` both players can read off the square. engine#155.
    //
    // Declared only when the variant actually covers something; the registry
    // reads the presence of this function as "this slice holds a secret", and
    // ordinary Xiangqi holds none.
    projectForSeat: coveredSpec ? (slice, seat) => {
      if (!Array.isArray(slice.board)) return slice
      let changed = false
      const board = slice.board.map(cell => {
        if (!cell || cell.trueType === undefined) return cell
        changed = true
        const { trueType, trueColour, ...seen } = cell
        return seen
      })
      return changed ? { ...slice, board } : slice
    } : undefined,

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      if (topology) {
        if (topology.rows) config.rows = topology.rows
        if (topology.cols) config.cols = topology.cols
      }
      const setup = pluginConfig.setup || config.setup || null
      let board = boardFromSetup(setup)
      if (coveredSpec) board = dealCovered(board, request('core.rng'))

      for (let i = 0; i < board.length; i++) {
        // A piece that is face down with no home square does not move at all -
        // in Banqi it can only be turned over - so there is no movement to
        // declare for it and nothing to check.
        const immobileWhileCovered = isCovered(board[i]) && !board[i].homeType
        const cellType = board[i] && !immobileWhileCovered ? effectiveType(board[i]) : null
        if (cellType && cellType !== 'soldier' && !PIECE_MOVES[cellType]) {
          throw new Error(`Unmapped piece type "${cellType}" at cell ${i}. Declare its movement in pieceMoves or remove it from setup.`)
        }
      }

      for (const [type, def] of Object.entries(VOCABULARY)) {
        const owners = def.symbols ? Object.keys(def.symbols) : []
        const hasPlayerOwner = owners.some(o => o === '0' || o === '1')
        if (hasPlayerOwner && type !== 'soldier' && type !== COVERED_TYPE && !PIECE_MOVES[type]) {
          throw new Error(`Vocabulary declares "${type}" but no matching entry in pieceMoves. Declare its movement or remove it from vocabulary.`)
        }
      }

      return { board, _cols: config.cols }
    },

    validateMove(move, slice, full) {
      if (config.passAllowed && move.action === 'pass') return true
      const legal = this.getLegalMoves(slice, full)
      if (move.action === 'flip') return legal.some(m => m.action === 'flip' && m.to === move.to)
      return legal.some(m => m.from === move.from && m.to === move.to)
    },

    applyMove(move, slice, full) {
      // Passing while the Generals face is bikjang: the game ends there, drawn.
      if (move.action === 'pass') {
        return config.bikjangDraw ? { ...slice, _bikjang: generalsFacing(slice.board) } : slice
      }
      // Turning a piece over. The first flip of the game also decides the
      // colours: whoever makes it commands the colour that comes up, and the
      // opponent commands the other. Until then no seat owns anything.
      if (move.action === 'flip') {
        const cell = slice.board[move.to]
        if (!isCovered(cell)) return slice
        if (cell.trueType === undefined) {
          throw new Error(
            `Cell ${move.to} is face down but carries no identity. A FEN records what a seat can see, `
            + 'so it cannot restore the hidden deal - resume from a full snapshot instead.')
        }
        const flipper = full.__players.currentIndex
        const colourSeat = slice.colourSeat
          || (coveredSpec.colourFromFirstFlip
            ? (cell.trueColour === 0 ? [flipper, 1 - flipper] : [1 - flipper, flipper])
            : [0, 1])
        const board = [...slice.board]
        board[move.to] = { type: cell.trueType, owner: colourSeat[cell.trueColour] }
        return { ...slice, board, colourSeat }
      }

      const board = [...slice.board]
      const moving = board[move.from]
      // Making the move is what turns it face up: it travelled as the square's
      // piece and lands as itself.
      board[move.to] = isCovered(moving) ? { type: moving.trueType, owner: moving.owner } : moving
      board[move.from] = null
      if (move.captured !== undefined && move.captured !== null) board[move.captured] = null
      return { ...slice, board }
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex
      const allMoves = []

      // Turning a piece over is a move, and before the first flip it is the
      // only one there is - nobody owns anything yet.
      if (flipIsAMove) {
        for (let i = 0; i < slice.board.length; i++) {
          const cell = slice.board[i]
          if (isCovered(cell)) allMoves.push({ action: 'flip', to: i })
        }
      }

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
        if (m.action === 'pass' || m.action === 'flip') return true
        // Nothing is royal in Banqi: losing the General loses a piece, not the
        // game, so there is no check to move out of or into.
        if (config.royal === false) return true
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

      // "A player who has no legal move loses." Banqi has no royal piece, so
      // this is the whole win condition rather than a stalemate rule beside
      // one - and it is checked against the player about to move, which after
      // a move and before the turn advances is the opponent.
      if (config.winCondition === 'no-moves') {
        const oppFull = { __players: { currentIndex: opponent } }
        return this.getLegalMoves(slice, oppFull).length === 0 ? playerIndex : null
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
