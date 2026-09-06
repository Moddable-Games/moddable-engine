import { warnUnknownConfigKeys } from '../../../core/index.js'
import { fromConfig } from '../../../piece-behaviour/index.js'
// Every config key this plugin reads. Exported so the corpus guard and the
// authoring docs share one source of truth, and kept separate from `defaults`,
// which only lists the keys that carry a default value.
export const CONFIG_KEYS = new Set([
  'advancement', 'afterMove', 'captureRule', 'cols',
  'dropCheckmateLimit', 'dropPawnFileLimit', 'drops', 'initialHands', 'moveFilter',
  'nifuLimit', 'nifuType', 'noDropLastRank', 'noDropSecondRank', 'pieceMoves',
  'pieceRotations', 'playerCount', 'promotionMap', 'promotionPieces', 'promotionZone',
  'rows', 'royalType', 'setup', 'turnLogic', 'winCondition',
])


export function createShogiPlugin(variantConfig = {}, context = {}) {
  const defPlayers = context.definition?.players
  const derivedPlayerCount = defPlayers ? (defPlayers.names || defPlayers).length : 2

  const defaults = {
    rows: 9,
    cols: 9,
    promotionZone: 3,
    dropPawnFileLimit: true,
    dropCheckmateLimit: true,
    playerCount: derivedPlayerCount,
  }

  const config = { ...defaults, ...variantConfig }

  warnUnknownConfigKeys('shogi', variantConfig, CONFIG_KEYS)

  let topology = null
  let _cachedCells = null

  // A family that captures custodially does not also capture by moving onto a
  // piece. Derived rather than declared twice: `captureRule` already says which
  // it is, and a second key saying the same thing is a second key to get wrong.
  const capturesByDisplacement = config.captureRule !== 'custodian'

  // Every cell that is part of the board, which on a voided topology is not
  // every index in the board array: a hole is stored as null and so reads as an
  // empty square to anything that walks the array by index.
  function playableCells(board) {
    if (_cachedCells) return _cachedCells
    _cachedCells = topology && topology.getAllCells
      ? topology.getAllCells()
      : board.map((_, i) => i)
    return _cachedCells
  }

  // Symbols match the setup SFEN/FEN used by the variant frontmatter in
  const DEFAULT_VOCABULARY = {
    king: { symbols: { 0: 'K', 1: 'k' } },
    rook: { symbols: { 0: 'R', 1: 'r' } },
    bishop: { symbols: { 0: 'B', 1: 'b' } },
    gold: { symbols: { 0: 'G', 1: 'g' } },
    silver: { symbols: { 0: 'S', 1: 's' } },
    knight: { symbols: { 0: 'N', 1: 'n' } },
    lance: { symbols: { 0: 'L', 1: 'l' } },
    pawn: { symbols: { 0: 'P', 1: 'p' } },
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

  function isInPromotionZone(row, col, playerIndex) {
    const advVec = advancementFor(playerIndex)
    if (advVec[0] === -1) return row < config.promotionZone
    if (advVec[0] === 1) return row >= config.rows - config.promotionZone
    if (advVec[1] === 1) return col >= config.cols - config.promotionZone
    if (advVec[1] === -1) return col < config.promotionZone
    return false
  }

  // Piece-behaviour schema definitions for each standard shogi piece type.
  // Directional pieces (all except king) are built per-player with flipped offsets.
  const DEFAULT_PIECE_MOVES = {
    king: { type: 'rider', dirs: 'all', maxSteps: 1 },
    rook: { type: 'rider', dirs: 'orthogonal' },
    bishop: { type: 'rider', dirs: 'diagonal' },
    gold: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]], directional: true },
    silver: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], directional: true },
    knight: { type: 'leaper', offsets: [[-2, -1], [-2, 1]], directional: true },
    lance: { type: 'rider', dirs: [[-1, 0]], directional: true },
    pawn: { type: 'leaper', offsets: [[-1, 0]], directional: true },
    promoted_rook: { type: 'compose', parts: [{ type: 'rider', dirs: 'orthogonal' }, { type: 'rider', dirs: 'diagonal', maxSteps: 1 }] },
    promoted_bishop: { type: 'compose', parts: [{ type: 'rider', dirs: 'diagonal' }, { type: 'rider', dirs: 'orthogonal', maxSteps: 1 }] },
    promoted_silver: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]], directional: true },
    promoted_knight: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]], directional: true },
    promoted_lance: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]], directional: true },
    promoted_pawn: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]], directional: true },
  }

  const PIECE_MOVES = config.pieceMoves
    ? { ...DEFAULT_PIECE_MOVES, ...config.pieceMoves }
    : DEFAULT_PIECE_MOVES

  // Cache of built primitives keyed by "type__playerIndex"
  const builtPieces = new Map()

  function rotateOffset([dr, dc], advVec) {
    if (advVec[0] === -1 && advVec[1] === 0) return [dr, dc]
    if (advVec[0] === 1 && advVec[1] === 0) return [-dr, -dc]
    if (advVec[0] === 0 && advVec[1] === 1) return [dc, -dr]
    if (advVec[0] === 0 && advVec[1] === -1) return [-dc, dr]
    return [dr, dc]
  }

  function rotateSpec(spec, advVec) {
    if (!spec || typeof spec !== 'object') return spec
    const out = { ...spec }
    if (Array.isArray(out.offsets)) out.offsets = out.offsets.map(o => rotateOffset(o, advVec))
    if (Array.isArray(out.dirs)) out.dirs = out.dirs.map(o => rotateOffset(o, advVec))
    if (out.type === 'compose' && Array.isArray(out.parts)) out.parts = out.parts.map(p => rotateSpec(p, advVec))
    return out
  }

  function advancementFor(playerIndex) {
    const raw = config.advancement ? config.advancement[playerIndex] : (playerIndex === 0 ? -1 : 1)
    return Array.isArray(raw) ? raw : [raw || -1, 0]
  }

  function buildPieceForPlayer(type, playerIndex) {
    const key = `${type}__${playerIndex}`
    if (builtPieces.has(key)) return builtPieces.get(key)
    const pConfig = PIECE_MOVES[type]
    if (!pConfig) return null
    const advVec = advancementFor(playerIndex)
    const needsRotate = pConfig.directional && !(advVec[0] === -1 && advVec[1] === 0)
    const spec = needsRotate ? rotateSpec(pConfig, advVec) : pConfig
    const primitive = fromConfig(spec)
    builtPieces.set(key, primitive)
    return primitive
  }

  // Minimal topology providing rays() and leapTargets() when no external
  // topology is available (tests create the plugin without one).
  function buildInternalTopology() {
    return {
      rays(from, directions, maxSteps) {
        const resolved = typeof directions === 'string' ? resolveDirections(directions) : directions
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
        const resolved = typeof offsets === 'string' ? resolveDirections(offsets) : offsets
        const [r, c] = rowCol(from)
        const targets = []
        for (const [dr, dc] of resolved) {
          const nr = r + dr, nc = c + dc
          if (inBounds(nr, nc)) targets.push(cellIndex(nr, nc))
        }
        return targets
      },
    }
  }

  const DIRECTIONS = {
    orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    diagonal: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    all: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
  }

  function resolveDirections(name) {
    return DIRECTIONS[name] || []
  }

  // Creates a board view with .friendly/.enemy properties for piece-behaviour primitives
  function buildViewBoard(board, playerIndex) {
    return board.map(cell => {
      if (cell === null) return null
      return { friendly: cell.owner === playerIndex, enemy: cell.owner !== playerIndex, ...cell }
    })
  }

  const promotionMap = config.promotionMap || null
  const demotionMap = promotionMap
    ? Object.fromEntries(Object.entries(promotionMap).map(([k, v]) => [v, k]))
    : null

  function getPromotedType(type) {
    if (promotionMap) {
      return promotionMap[type] || null
    }
    if (type.startsWith('promoted_')) return null
    if (type === royalType || type === 'gold') return null
    const promoted = `promoted_${type}`
    if (!PIECE_MOVES[promoted]) return null
    return promoted
  }

  function getDemotedType(type) {
    if (demotionMap && demotionMap[type]) return demotionMap[type]
    if (type.startsWith('promoted_')) return type.slice(9)
    return type
  }

  function generatePieceMoves(board, pos, piece, playerIndex) {
    const primitive = buildPieceForPlayer(piece.type, playerIndex)
    if (!primitive) return []
    const topo = topology || buildInternalTopology()
    const viewBoard = buildViewBoard(board, playerIndex)
    const rawMoves = primitive.genMoves(topo, pos, viewBoard)
    // Custodial capture is not an addition to capture by displacement, it is
    // instead of it: a Hasami Shogi piece slides through empty squares and may
    // not land on an occupied one at all. The rule was wired into applyMove and
    // not into move generation, so the variant took 12 pieces by displacement
    // against 3 by sandwich and played as ordinary shogi (engine#160).
    const moves = capturesByDisplacement
      ? rawMoves
      : rawMoves.filter(m => board[m.to] === null)
    return moves.map(m => ({ from: m.from, to: m.to }))
  }

  function generateDropMoves(board, hand, playerIndex) {
    const moves = []
    const uniqueTypes = [...new Set(hand)]

    // Walked `board` by index, so a void was a legal drop square: four-player
    // shogi offered 324 drops into the corners that are not part of its board
    // over 150 plies, and left three pieces standing in them (engine#158).
    const cells = playableCells(board)

    for (const type of uniqueTypes) {
      for (const i of cells) {
        if (board[i] !== null) continue

        const nifuType = config.nifuType || 'pawn'
        const nifuLimit = config.nifuLimit || 1
        if (config.dropPawnFileLimit && type === nifuType) {
          const [, col] = rowCol(i)
          let count = 0
          for (let idx = 0; idx < board.length; idx++) {
            const cell = board[idx]
            if (!cell || cell.owner !== playerIndex || cell.type !== nifuType) continue
            const [, cellCol] = rowCol(idx)
            if (cellCol === col) count++
          }
          if (count >= nifuLimit) continue
        }

        const [row, col] = rowCol(i)
        const advVec = advancementFor(playerIndex)
        const isVertical = advVec[0] !== 0
        const coordVal = isVertical ? row : col
        const maxCoord = isVertical ? config.rows - 1 : config.cols - 1
        const advancing = isVertical ? advVec[0] : advVec[1]
        const lastRank = advancing === -1 ? 0 : maxCoord
        const secondRank = advancing === -1 ? 1 : maxCoord - 1
        const noLastRank = config.noDropLastRank || ['pawn', 'lance']
        const noSecondRank = config.noDropSecondRank || ['knight']
        if (noLastRank.includes(type)) {
          if (coordVal === lastRank) continue
        }
        if (noSecondRank.includes(type)) {
          if (advancing === -1 ? coordVal <= secondRank : coordVal >= secondRank) continue
        }

        moves.push({ action: 'drop', type, to: i })
      }
    }

    return moves
  }

  const royalType = config.royalType || 'king'

  function isRoyalless() {
    return config.royalType === null || config.royalType === 'none'
  }

  // Custodian capture: after a move, any enemy piece flanked on two opposite
  // sides along a rank or file is removed. The mover must close the trap, so
  // moving between two enemies is safe, and a player never loses their own
  // piece on their own turn.
  function applyCustodianCapture(board, to, playerIndex) {
    const [r, c] = rowCol(to)
    const removed = []
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const vr = r + dr, vc = c + dc
      const fr = r + dr * 2, fc = c + dc * 2
      if (!inBounds(vr, vc) || !inBounds(fr, fc)) continue
      const victim = board[cellIndex(vr, vc)]
      const anchor = board[cellIndex(fr, fc)]
      if (!victim || victim.owner === playerIndex) continue
      if (!anchor || anchor.owner !== playerIndex) continue
      removed.push(cellIndex(vr, vc))
    }
    // Corner capture: a piece in a corner falls when both of its neighbours
    // along the edge are enemies.
    const corners = [
      [0, 0, [[0, 1], [1, 0]]],
      [0, config.cols - 1, [[0, -1], [1, 0]]],
      [config.rows - 1, 0, [[0, 1], [-1, 0]]],
      [config.rows - 1, config.cols - 1, [[0, -1], [-1, 0]]],
    ]
    for (const [cr, cc, neighbours] of corners) {
      const idx = cellIndex(cr, cc)
      const occupant = board[idx]
      if (!occupant || occupant.owner === playerIndex) continue
      const trapped = neighbours.every(([dr, dc]) => {
        const n = board[cellIndex(cr + dr, cc + dc)]
        return n && n.owner === playerIndex
      })
      if (trapped) removed.push(idx)
    }
    for (const idx of removed) board[idx] = null
    return removed.length
  }

  function findKing(board, playerIndex) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] && board[i].owner === playerIndex && board[i].type === royalType) return i
    }
    return -1
  }

  function canAttack(board, from, target, piece, playerIndex) {
    const primitive = buildPieceForPlayer(piece.type, playerIndex)
    if (!primitive) return false
    const topo = topology || buildInternalTopology()
    // attacks() needs the board to check for blocking pieces on sliding paths
    return primitive.attacks(topo, from, target, board)
  }

  function isInCheck(board, playerIndex) {
    const kingPos = findKing(board, playerIndex)
    if (kingPos === -1) return true
    for (let i = 0; i < board.length; i++) {
      if (!board[i] || board[i].owner === playerIndex) continue
      if (canAttack(board, i, kingPos, board[i], board[i].owner)) return true
    }
    return false
  }

  const plugin = {
    sliceName: 'shogi',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['king', 'rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'],
    vocabulary: VOCABULARY,
    config,
    rules: ['capture.recruit', 'promotion.zone', 'check', 'checkmate'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      _cachedCells = null
      if (topology) {
        if (topology.rows) config.rows = topology.rows
        if (topology.cols) config.cols = topology.cols
      }
      const setup = pluginConfig.setup || config.setup || null
      const board = setup ? parseSetup(setup) : buildDefaultBoard()

      // Validate: every board cell type must have a movement definition
      for (let i = 0; i < board.length; i++) {
        if (board[i] && !PIECE_MOVES[board[i].type]) {
          throw new Error(`Unmapped piece type "${board[i].type}" at cell ${i}. Declare its movement in pieceMoves or remove it from setup.`)
        }
      }

      // Validate: vocabulary entries with player ownership must have piece definitions
      for (const [type, def] of Object.entries(VOCABULARY)) {
        const owners = def.symbols ? Object.keys(def.symbols) : []
        const hasPlayerOwner = owners.some(o => o === '0' || o === '1')
        if (hasPlayerOwner && !PIECE_MOVES[type]) {
          throw new Error(`Vocabulary declares "${type}" but no matching entry in pieceMoves. Declare its movement or remove it from vocabulary.`)
        }
      }

      const hands = Array.from({ length: config.playerCount }, (_, i) =>
        config.initialHands?.[i]?.slice() || []
      )
      return {
        board,
        hands,
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
      const hands = slice.hands.map(h => h.slice())

      if (move.action === 'drop') {
        board[move.to] = { type: move.type, owner: playerIndex }
        const idx = hands[playerIndex].indexOf(move.type)
        if (idx !== -1) hands[playerIndex].splice(idx, 1)
        let droppedSlice = { ...slice, board, hands }
        if (config.afterMove) {
          const result = config.afterMove({
            move, board, hands, piece: board[move.to], captured: null, playerIndex,
            topology, slice: droppedSlice, cellIndex, rowCol, rows: config.rows, cols: config.cols,
          })
          if (result) droppedSlice = { ...droppedSlice, ...result }
        }
        return droppedSlice
      }

      const piece = board[move.from]
      const captured = board[move.to]

      board[move.from] = null

      if (captured) {
        const demoted = getDemotedType(captured.type)
        if (demoted !== royalType) {
          hands[playerIndex].push(demoted)
        }
      }

      let newType = piece.type
      if (move.promote) {
        const promoted = getPromotedType(piece.type)
        if (promoted) newType = promoted
      }

      board[move.to] = { type: newType, owner: playerIndex }

      if (config.captureRule === 'custodian') {
        applyCustodianCapture(board, move.to, playerIndex)
      }

      let newSlice = { ...slice, board, hands }
      if (config.afterMove) {
        const result = config.afterMove({
          move, board, hands, piece, captured, playerIndex,
          topology, slice: newSlice, cellIndex, rowCol, rows: config.rows, cols: config.cols,
        })
        if (result) newSlice = { ...newSlice, ...result }
      }
      return newSlice
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex
      const allMoves = []

      for (let i = 0; i < slice.board.length; i++) {
        const piece = slice.board[i]
        if (!piece || piece.owner !== playerIndex) continue
        const pieceMoves = generatePieceMoves(slice.board, i, piece, playerIndex)

        for (const m of pieceMoves) {
          const [fromRow, fromCol] = rowCol(m.from)
          const [toRow, toCol] = rowCol(m.to)
          const canPromote = isInPromotionZone(toRow, toCol, playerIndex) || isInPromotionZone(fromRow, fromCol, playerIndex)
          const promotedType = getPromotedType(piece.type)

          if (canPromote && promotedType) {
            allMoves.push({ ...m, promote: true })
            const advVec = advancementFor(playerIndex)
            const isVertical = advVec[0] !== 0
            const lastRank = isVertical ? (advVec[0] === -1 ? 0 : config.rows - 1) : (advVec[1] === -1 ? 0 : config.cols - 1)
            const secondRank = isVertical ? (advVec[0] === -1 ? 1 : config.rows - 2) : (advVec[1] === -1 ? 1 : config.cols - 2)
            const coordVal = isVertical ? toRow : toCol
            const mustPromote = (piece.type === 'pawn' || piece.type === 'lance') && coordVal === lastRank
            const mustPromoteKnight = piece.type === 'knight' &&
              (advVec[0] === -1 || advVec[1] === -1 ? coordVal <= secondRank : coordVal >= secondRank)
            if (!mustPromote && !mustPromoteKnight) {
              allMoves.push(m)
            }
          } else {
            allMoves.push(m)
          }
        }
      }

      if (config.drops !== false) {
        const drops = generateDropMoves(slice.board, slice.hands[playerIndex], playerIndex)
        allMoves.push(...drops)
      }

      const generated = config.moveFilter
        ? config.moveFilter(allMoves, slice, { currentPlayer: playerIndex, config })
        : allMoves

      // With no royal piece there is no check to legalise against, so the
      // generated list is already the legal list.
      if (isRoyalless()) return generated

      return generated.filter(m => {
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
        if (isInCheck(testBoard, playerIndex)) return false
        if (config.dropCheckmateLimit && config.playerCount <= 2 && m.action === 'drop' && m.type === 'pawn') {
          const opponent = 1 - playerIndex
          if (isInCheck(testBoard, opponent)) {
            const testSlice = { ...slice, board: testBoard }
            const oppFull = { __players: { currentIndex: opponent } }
            const oppMoves = plugin.getLegalMoves(testSlice, oppFull)
            if (oppMoves.length === 0) return false
          }
        }
        return true
      })
    },

    checkWin(slice, full) {
      const playerIndex = full.__players.currentIndex
      const eliminated = full.__players.eliminated || []
      const isMultiplayer = config.playerCount > 2

      if (config.winCondition === 'reduced-to-one') {
        const counts = Array.from({ length: config.playerCount }, () => 0)
        for (const cell of slice.board) if (cell) counts[cell.owner]++
        if (isMultiplayer) {
          for (let opp = 0; opp < config.playerCount; opp++) {
            if (opp === playerIndex || eliminated.includes(opp)) continue
            if (counts[opp] <= 1) return { eliminate: opp }
          }
          return null
        }
        const opponent = 1 - playerIndex
        if (counts[opponent] <= 1) return playerIndex
        if (counts[playerIndex] <= 1) return opponent
        return null
      }

      if (typeof config.winCondition === 'function') {
        const result = config.winCondition(slice, {
          currentPlayer: playerIndex, config, rows: config.rows, cols: config.cols,
        })
        if (result !== null && result !== undefined) return result
      }

      if (isRoyalless()) return null

      if (isMultiplayer) {
        for (let opp = 0; opp < config.playerCount; opp++) {
          if (opp === playerIndex || eliminated.includes(opp)) continue
          if (findKing(slice.board, opp) === -1) return { eliminate: opp }
        }
        return null
      }

      const opponent = 1 - playerIndex
      if (findKing(slice.board, opponent) === -1) return playerIndex

      if (isInCheck(slice.board, opponent)) {
        const oppFull = { __players: { currentIndex: opponent } }
        const oppMoves = this.getLegalMoves(slice, oppFull)
        if (oppMoves.length === 0) return playerIndex
      }

      return null
    },
  }

  function buildDefaultBoard() {
    return new Array(config.rows * config.cols).fill(null)
  }

  // The starting position comes from the variant's frontmatter in
  // moddable-rules, the same string the published board diagram is drawn from.
  // A "+" prefix marks a promoted piece. The plugin models promotion as a
  // distinct piece type rather than a flag, so the marker is resolved to the
  // promoted type: a piece carrying only a flag would be moved as though it
  // were unpromoted.
  function parseSetup(setup) {
    if (Array.isArray(setup)) return setup
    if (!setup || !topology || !topology.parsePosition) {
      return new Array(config.rows * config.cols).fill(null)
    }

    // Strip the promotion markers so the notation is plain enough for
    // parsePosition, recording which piece each one applied to.
    const promotedAt = new Set()
    let plain = ''
    let pieceIndex = 0
    for (const ch of setup) {
      if (ch === '+') {
        promotedAt.add(pieceIndex)
        continue
      }
      plain += ch
      if (ch !== '/' && !(ch >= '0' && ch <= '9')) pieceIndex++
    }

    const board = topology.parsePosition(plain, VOCABULARY)
    if (promotedAt.size === 0) return board

    let seen = 0
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue
      if (promotedAt.has(seen)) {
        const promotedType = getPromotedType(board[i].type)
        if (promotedType) board[i] = { ...board[i], type: promotedType }
      }
      seen++
    }
    return board
  }

  return plugin
}

createShogiPlugin.configKeys = CONFIG_KEYS
createShogiPlugin.interaction = 'drop'
