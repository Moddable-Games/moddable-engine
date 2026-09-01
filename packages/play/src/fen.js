import { fileLabel } from '../../core/index.js'
// Loading a FEN and applying a move is the one operation every puzzle consumer
// needs and every consumer has so far reimplemented as string surgery on the
// FEN itself. Those hand-rolled mutators lose castling rights, forget to move
// the rook, leave the en-passant-captured pawn on the board and never touch the
// clocks. The engine already knows all of that — it is the thing that generates
// the moves — so the position after a move is computed by playing the move in a
// real game and serialising the result, not by editing a string.
//
// Everything here is board-size and vocabulary agnostic: dimensions come from
// the variant's topology and piece letters come from the plugin's vocabulary,
// so Grand Chess (10x10, files a..j, chancellor promotions) round-trips on the
// same code path as standard chess.

import { createGameForFamily } from './play.js'
import { moveToSAN } from '../../plugins/chess/index.js'

const WHITE = 0

export function createGameForVariant(family, variant, opts = {}) {
  return createGameForFamily(family, { variant, rngSeed: opts.rngSeed ?? 1 })
}

function pluginOf(game) {
  const plugins = game.raw.registry.getPlugins()
  return plugins.find(p => p.sliceName === game.getState().family) || plugins[0]
}

function dimsOf(game) {
  const topo = game.topology
  if (!topo || topo.rows === undefined) {
    throw new Error('FEN support requires a grid topology')
  }
  return { rows: topo.rows, cols: topo.cols }
}

function tryDimsOf(game) {
  const topo = game.topology
  if (!topo || topo.rows === undefined) return null
  return { rows: topo.rows, cols: topo.cols }
}

/** a1-style square id -> board index. Files run a.. beyond h; ranks may be 2 digits. */
function squareToIndex(square, rows, cols) {
  const match = /^([a-z])(\d+)$/.exec(square)
  if (!match) return null
  const c = match[1].charCodeAt(0) - 97
  const r = rows - parseInt(match[2], 10)
  if (c < 0 || c >= cols || r < 0 || r >= rows) return null
  return r * cols + c
}

function indexToSquare(index, rows, cols) {
  const r = Math.floor(index / cols)
  const c = index % cols
  return fileLabel(c) + (rows - r)
}

/** Split "e2e4" / "i7h8q" / "c10g10" into from/to/promotion without assuming 8x8. */
function parseUci(uci, rows, cols) {
  const match = /^([a-z]\d+?)([a-z]\d+?)([a-zA-Z])?$/.exec(String(uci))
  if (!match) return null
  const from = squareToIndex(match[1], rows, cols)
  const to = squareToIndex(match[2], rows, cols)
  if (from === null || to === null) return null
  return { from, to, promotion: match[3] || null }
}

// A vocabulary symbol longer than one character is written bracketed, which is
// how the large shogi variants address 29 or more piece types on one board.
// Written raw, `LN` reads back as an `L` and an `N`: Dai Shogi exported a FEN
// whose every row was twice too long and re-imported as a different position.
function encodeSymbol(sym) {
  return String(sym).length > 1 ? `[${sym}]` : String(sym)
}

function symbolToType(vocabulary, letter) {
  const lower = letter.toLowerCase()
  for (const [type, def] of Object.entries(vocabulary)) {
    for (const symbol of Object.values(def.symbols || {})) {
      if (String(symbol).toLowerCase() === lower) return type
    }
  }
  return null
}

/**
 * Load a full FEN into a live game. Board comes through the topology's own
 * parser (so the plugin's vocabulary decides what every letter means), and the
 * remaining fields land in the slice keys the plugin actually reads.
 */
export function loadFen(game, fen) {
  const topo = game.topology
  const plugin = pluginOf(game)
  const state = game.getState()

  if (topo && !topo.rows && topo.parsePosition) {
    return loadFenHex(game, fen, topo, plugin)
  }

  const { rows, cols } = dimsOf(game)
  const parts = String(fen).trim().split(/\s+/)

  if (state.slice.hands && !plugin.config?.castling) {
    return loadFenWithHands(game, fen, parts, topo, plugin, rows, cols)
  }

  const [boardPart, turnPart = 'w', castlingPart = '-', epPart = '-', halfPart = '0', fullPart = '1'] = parts

  const board = topo.parsePosition(boardPart, plugin.vocabulary)
  const previous = state.slice
  const slice = { ...previous, board, halfmoveClock: Number(halfPart) || 0, fullmoveNumber: Number(fullPart) || 1 }

  if ('castlingRights' in previous || plugin.config?.castling) {
    slice.castlingRights = {
      0: { king: castlingPart.includes('K'), queen: castlingPart.includes('Q') },
      1: { king: castlingPart.includes('k'), queen: castlingPart.includes('q') },
    }
  }

  if ('enPassantTarget' in previous || plugin.config?.enPassant) {
    const target = epPart === '-' ? null : squareToIndex(epPart, rows, cols)
    slice.enPassantTarget = target
    slice.enPassantPawn = target === null ? null : findEnPassantPawn(board, target, cols, turnPart === 'w' ? 1 : 0, plugin)
  }

  const turnIndex = turnPart === 'b' ? 1 : WHITE
  game.loadState({ slice, players: { ...game.getState().players, currentIndex: turnIndex } })
  return game
}

function loadFenWithHands(game, fen, parts, topo, plugin, rows, cols) {
  const [boardPart, turnPart = 'w', handPart = '-', halfPart = '0', fullPart = '1'] = parts
  const board = parseBoardWithPromotions(boardPart, topo, plugin, rows, cols)
  const previous = game.getState().slice
  const hands = parseHands(handPart, plugin.vocabulary, previous.hands.length)
  const slice = { ...previous, board, hands, halfmoveClock: Number(halfPart) || 0, fullmoveNumber: Number(fullPart) || 1 }
  const turnIndex = turnPart === 'b' ? 1 : WHITE
  game.loadState({ slice, players: { ...game.getState().players, currentIndex: turnIndex } })
  return game
}

function parseBoardWithPromotions(boardPart, topo, plugin, rows, cols) {
  if (!boardPart.includes('+')) return topo.parsePosition(boardPart, plugin.vocabulary)

  const vocabulary = plugin.vocabulary || {}
  const fromSym = new Map()
  for (const [type, def] of Object.entries(vocabulary)) {
    if (def.symbols) {
      for (const [owner, symbol] of Object.entries(def.symbols)) {
        fromSym.set(symbol, { type, owner: /^\d+$/.test(owner) ? parseInt(owner, 10) : owner })
      }
    }
  }

  const promotionMap = plugin.config?.promotionMap || null
  function getPromotedType(type) {
    if (promotionMap) return promotionMap[type] || null
    if (type.startsWith('promoted_')) return null
    if (type === (plugin.config?.royalType || 'king') || type === 'gold') return null
    return `promoted_${type}`
  }

  const cells = new Array(rows * cols).fill(null)
  const rowStrings = boardPart.split('/')
  for (let r = 0; r < rowStrings.length && r < rows; r++) {
    let c = 0
    let promoted = false
    for (let i = 0; i < rowStrings[r].length; i++) {
      const ch = rowStrings[r][i]
      if (ch === '+') { promoted = true; continue }
      if (ch >= '0' && ch <= '9') {
        let num = ch
        while (i + 1 < rowStrings[r].length && rowStrings[r][i + 1] >= '0' && rowStrings[r][i + 1] <= '9') {
          num += rowStrings[r][++i]
        }
        c += parseInt(num, 10)
        continue
      }
      let sym = ch
      if (ch === '[') {
        const close = rowStrings[r].indexOf(']', i)
        if (close === -1) { promoted = false; continue }
        sym = rowStrings[r].slice(i + 1, close)
        i = close
      }
      const piece = fromSym.get(sym)
      if (piece && c < cols) {
        if (promoted) {
          const pType = getPromotedType(piece.type)
          cells[r * cols + c] = { type: pType || piece.type, owner: piece.owner }
        } else {
          cells[r * cols + c] = { ...piece }
        }
      }
      promoted = false
      c++
    }
  }
  return cells
}

function parseHands(handPart, vocabulary, playerCount) {
  const hands = Array.from({ length: playerCount }, () => [])
  if (handPart === '-') return hands

  const fromSym = new Map()
  for (const [type, def] of Object.entries(vocabulary)) {
    if (def.symbols) {
      for (const [owner, symbol] of Object.entries(def.symbols)) {
        fromSym.set(symbol, { type, owner: /^\d+$/.test(owner) ? parseInt(owner, 10) : owner })
      }
    }
  }

  let count = 0
  for (let i = 0; i < handPart.length; i++) {
    const ch = handPart[i]
    if (ch >= '0' && ch <= '9') {
      count = count * 10 + parseInt(ch, 10)
      continue
    }
    const piece = fromSym.get(ch)
    if (piece) {
      const n = count || 1
      for (let j = 0; j < n; j++) hands[piece.owner].push(piece.type)
    }
    count = 0
  }
  return hands
}

function loadFenHex(game, fen, topo, plugin) {
  const parts = String(fen).trim().split(/\s+/)
  const [boardPart, turnPart = 'w', halfPart = '0', fullPart = '1'] = parts
  const board = topo.parsePosition(boardPart, plugin.vocabulary)
  const previous = game.getState().slice
  const slice = { ...previous, board, halfmoveClock: Number(halfPart) || 0, fullmoveNumber: Number(fullPart) || 1 }
  const turnIndex = turnPart === 'b' ? 1 : WHITE
  game.loadState({ slice, players: { ...game.getState().players, currentIndex: turnIndex } })
  return game
}

function findEnPassantPawn(board, target, cols, owner, plugin) {
  const pawnType = plugin.config?.pawnType || 'pawn'
  for (const candidate of [target - cols, target + cols]) {
    const cell = board[candidate]
    if (cell && cell.owner === owner && cell.type === pawnType) return candidate
  }
  return null
}

/** Serialise a live game back to a full FEN. */
export function toFen(game) {
  const topo = game.topology
  const plugin = pluginOf(game)
  const state = game.getState()
  const slice = state.slice

  if (topo && !topo.rows && topo.serializePosition) {
    return toFenHex(game, topo, plugin, slice)
  }

  const { rows, cols } = dimsOf(game)
  const boardPart = serializeBoardWithPromotions(slice.board, topo, plugin, rows, cols)
  const turnPart = playerIndex(game) === WHITE ? 'w' : 'b'

  if (slice.hands && !plugin.config?.castling) {
    const handPart = serializeHands(slice.hands, plugin.vocabulary)
    return [boardPart, turnPart, handPart, slice.halfmoveClock ?? 0, slice.fullmoveNumber ?? 1].join(' ')
  }

  let castlingPart = '-'
  if (slice.castlingRights) {
    const rights = [
      slice.castlingRights[0]?.king ? 'K' : '',
      slice.castlingRights[0]?.queen ? 'Q' : '',
      slice.castlingRights[1]?.king ? 'k' : '',
      slice.castlingRights[1]?.queen ? 'q' : '',
    ].join('')
    castlingPart = rights || '-'
  }

  const epPart = slice.enPassantTarget === null || slice.enPassantTarget === undefined
    ? '-'
    : indexToSquare(slice.enPassantTarget, rows, cols)

  return [
    boardPart,
    turnPart,
    castlingPart,
    epPart,
    slice.halfmoveClock ?? 0,
    slice.fullmoveNumber ?? 1,
  ].join(' ')
}

function serializeBoardWithPromotions(board, topo, plugin, rows, cols) {
  const hasPromoted = board.some(c => c && typeof c.type === 'string' && c.type.startsWith('promoted_'))
  if (!hasPromoted) return topo.serializePosition(board, plugin.vocabulary)

  const vocabulary = plugin.vocabulary || {}
  const rowStrings = []
  for (let r = 0; r < rows; r++) {
    let rowStr = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const cell = board[r * cols + c]
      if (cell === null || cell === undefined) {
        empty++
      } else {
        if (empty > 0) { rowStr += String(empty); empty = 0 }
        if (typeof cell.type === 'string' && cell.type.startsWith('promoted_')) {
          const baseType = cell.type.slice('promoted_'.length)
          const entry = vocabulary[baseType]
          const sym = entry?.symbols?.[cell.owner]
          rowStr += sym ? '+' + encodeSymbol(sym) : '?'
        } else {
          const entry = vocabulary[cell.type]
          const sym = entry?.symbols?.[cell.owner]
          rowStr += sym ? encodeSymbol(sym) : '?'
        }
      }
    }
    if (empty > 0) rowStr += String(empty)
    rowStrings.push(rowStr)
  }
  return rowStrings.join('/')
}

function serializeHands(hands, vocabulary) {
  let result = ''
  for (let owner = 0; owner < hands.length; owner++) {
    const hand = hands[owner]
    if (!hand || hand.length === 0) continue
    const counts = {}
    for (const type of hand) {
      counts[type] = (counts[type] || 0) + 1
    }
    for (const [type, count] of Object.entries(counts)) {
      const entry = vocabulary[type]
      const sym = entry?.symbols?.[owner]
      if (!sym) continue
      if (count > 1) result += String(count)
      result += sym
    }
  }
  return result || '-'
}

function toFenHex(game, topo, plugin, slice) {
  const boardPart = topo.serializePosition(slice.board, plugin.vocabulary)
  const turnPart = playerIndex(game) === WHITE ? 'w' : 'b'
  return [boardPart, turnPart, slice.halfmoveClock ?? 0, slice.fullmoveNumber ?? 1].join(' ')
}

function playerIndex(game) {
  const players = game.getState().players
  return players && typeof players.currentIndex === 'number' ? players.currentIndex : WHITE
}

/**
 * Find the engine's own move object for a move string among the legal moves.
 * UCI is the pool's usual notation; the six historical records carry SAN, so
 * both are accepted. Bare-square notation ("d3") matches placement moves
 * (reversi, go) where the move has no from-square.
 * Returns null when the move is not legal — callers decide whether that is a
 * data defect or an expected skip.
 */
export function findLegalMove(game, notation) {
  const dims = tryDimsOf(game)
  if (!dims) {
    return findHexMove(game, notation)
  }
  const { rows, cols } = dims
  const parsed = parseUci(notation, rows, cols)
  if (!parsed) {
    const placement = findPlacementMove(game, notation, rows, cols)
    if (placement) return placement
    return findSanMove(game, notation)
  }
  const plugin = pluginOf(game)
  const wanted = parsed.promotion ? symbolToType(plugin.vocabulary, parsed.promotion) : null
  const candidates = game.getLegalMoves()
    .filter(m => m.from === parsed.from && m.to === parsed.to)
  if (candidates.length === 0) return null
  if (wanted) {
    const exact = candidates.find(m => m.promotion === wanted)
    if (exact) return exact
  }
  const plain = candidates.find(m => !m.promotion)
  return plain || candidates[0]
}

function findPlacementMove(game, notation, rows, cols) {
  const target = squareToIndex(notation, rows, cols)
  if (target === null) return null
  const candidates = game.getLegalMoves()
    .filter(m => m.from === undefined && (m.coord === target || m.to === target))
  if (candidates.length === 0) return null
  return candidates[0]
}

function findHexMove(game, notation) {
  const legal = game.getLegalMoves()
  const sepIdx = notation.indexOf('>')
  if (sepIdx !== -1) {
    const from = notation.slice(0, sepIdx)
    const to = notation.slice(sepIdx + 1)
    const match = legal.find(m => m.from === from && m.to === to)
    if (match) return match
  }
  const match = legal.find(m => m.from === notation || m.to === notation)
  return match || null
}

/** SAN match, using the engine's own notation writer so disambiguation agrees. */
function findSanMove(game, san) {
  const wanted = String(san).replace(/[+#!?]+$/, '')
  const board = game.getState().slice.board
  const legal = game.getLegalMoves()
  if (!legal.length || legal[0].from === undefined) return null
  for (const move of legal) {
    try {
      const written = moveToSAN(move, board, game.topology, legal).replace(/[+#!?]+$/, '')
      if (written === wanted) return move
    } catch { continue }
  }
  return null
}

/** Play a UCI (or SAN) move through the engine. Throws when it is not legal. */
function applyMoveNotation(game, notation) {
  const move = findLegalMove(game, notation)
  if (!move) {
    throw new Error(`Move "${notation}" is not legal in ${toFen(game)}`)
  }
  const result = game.applyMove(move)
  if (result && result.ok === false) {
    throw new Error(`Move "${notation}" rejected by the engine: ${result.reason}`)
  }
  return { move, result }
}

/**
 * The whole point of this module: given a FEN and a UCI move, return the FEN of
 * the resulting position, computed by the engine that owns the rules.
 */
export function fenAfterMove(family, variant, fen, uci, opts = {}) {
  const game = createGameForVariant(family, variant, opts)
  loadFen(game, fen)
  applyMoveNotation(game, uci)
  return toFen(game)
}
