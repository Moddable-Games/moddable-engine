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
import { moveToSAN } from '../../plugins/chess/src/san.js'

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
  if (!topo || topo.rows === undefined) throw new Error('FEN support requires a grid topology')
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
  return String.fromCharCode(97 + c) + (rows - r)
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
  const { rows, cols } = dimsOf(game)
  const plugin = pluginOf(game)
  const parts = String(fen).trim().split(/\s+/)
  const [boardPart, turnPart = 'w', castlingPart = '-', epPart = '-', halfPart = '0', fullPart = '1'] = parts

  const board = game.topology.parsePosition(boardPart, plugin.vocabulary)
  const previous = game.getState().slice
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
    // The plugin captures slice.enPassantPawn, not the target square. Derive it
    // from the board rather than assuming which way pawns advance.
    slice.enPassantPawn = target === null ? null : findEnPassantPawn(board, target, cols, turnPart === 'w' ? 1 : 0, plugin)
  }

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
  const { rows, cols } = dimsOf(game)
  const plugin = pluginOf(game)
  const state = game.getState()
  const slice = state.slice
  const boardPart = game.topology.serializePosition(slice.board, plugin.vocabulary)
  const turnPart = playerIndex(game) === WHITE ? 'w' : 'b'

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

function playerIndex(game) {
  const players = game.getState().players
  return players && typeof players.currentIndex === 'number' ? players.currentIndex : WHITE
}

/**
 * Find the engine's own move object for a move string among the legal moves.
 * UCI is the pool's usual notation; the six historical records carry SAN, so
 * both are accepted. Returns null when the move is not legal — callers decide
 * whether that is a data defect or an expected skip.
 */
export function findLegalMove(game, notation) {
  const { rows, cols } = dimsOf(game)
  const parsed = parseUci(notation, rows, cols)
  if (!parsed) return findSanMove(game, notation)
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

/** SAN match, using the engine's own notation writer so disambiguation agrees. */
function findSanMove(game, san) {
  const wanted = String(san).replace(/[+#!?]+$/, '')
  const board = game.getState().slice.board
  const legal = game.getLegalMoves()
  for (const move of legal) {
    const written = moveToSAN(move, board, game.topology, legal).replace(/[+#!?]+$/, '')
    if (written === wanted) return move
  }
  return null
}

/** Play a UCI (or SAN) move through the engine. Throws when it is not legal. */
export function applyMoveNotation(game, notation) {
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
