import { warnUnknownConfigKeys } from '../../../core/index.js'
// Every config key this plugin reads. Exported so the corpus guard and the
// authoring docs share one source of truth, and kept separate from `defaults`,
// which only lists the keys that carry a default value.
export const CONFIG_KEYS = new Set([
  'allowPass', 'cols', 'directions', 'mustFlip', 'passWhenNoMoves', 'playerCount', 'rows',
  'scoreEmptyTo', 'setup', 'turnLogic', 'winBy',
])

export function createReversiPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    rows: 8,
    cols: 8,
    directions: 'all',
    mustFlip: true,
    winBy: 'most',
    passWhenNoMoves: true,
    allowPass: false,
    scoreEmptyTo: null,
  }

  const config = { ...defaults, ...variantConfig }

  warnUnknownConfigKeys('reversi', variantConfig, CONFIG_KEYS)

  const hooks = {
    moveFilter: (moves) => moves,
    winCondition: null,
    ...config.hooks,
  }

  let topology = null

  const DEFAULT_VOCABULARY = {
    disc: { symbols: { 0: 'b', 1: 'w' } },
  }

  const VOCABULARY = config.vocabulary || DEFAULT_VOCABULARY

  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

  function directions() {
    if (config.directions === 'orthogonal') return ORTHOGONAL
    if (config.directions === 'diagonal') return DIAGONAL
    return [...ORTHOGONAL, ...DIAGONAL]
  }

  function cellIndex(row, col) {
    return row * config.cols + col
  }

  function rowCol(idx) {
    return [Math.floor(idx / config.cols), idx % config.cols]
  }

  function inBounds(r, c) {
    return r >= 0 && r < config.rows && c >= 0 && c < config.cols
  }

  function currentPlayer(full) {
    return full && full.__players ? full.__players.currentIndex : 0
  }

  function boardFromSetup(setup) {
    if (!setup) return new Array(config.rows * config.cols).fill(null)
    if (Array.isArray(setup)) return setup
    if (topology && topology.parsePosition) {
      return topology.parsePosition(setup, VOCABULARY)
    }
    return new Array(config.rows * config.cols).fill(null)
  }

  function flipsFor(board, idx, playerIndex) {
    if (board[idx]) return []
    const opponent = 1 - playerIndex
    const [row, col] = rowCol(idx)
    const flipped = []

    for (const [dr, dc] of directions()) {
      const run = []
      let r = row + dr
      let c = col + dc

      while (inBounds(r, c)) {
        const piece = board[cellIndex(r, c)]
        if (!piece) break
        if (piece.owner === opponent) {
          run.push(cellIndex(r, c))
          r += dr
          c += dc
          continue
        }
        if (piece.owner === playerIndex && run.length > 0) {
          flipped.push(...run)
        }
        break
      }
    }

    return flipped
  }

  function movesFor(board, playerIndex) {
    const moves = []
    for (let idx = 0; idx < board.length; idx++) {
      if (board[idx]) continue
      const flips = flipsFor(board, idx, playerIndex)
      if (config.mustFlip && flips.length === 0) continue
      moves.push({ action: 'place', coord: idx, flips })
    }
    return moves
  }

  function discCount(board, playerIndex) {
    let count = 0
    for (const piece of board) {
      if (piece && piece.owner === playerIndex) count++
    }
    return count
  }

  function scoreOutcome(board) {
    const mine = discCount(board, 0)
    const theirs = discCount(board, 1)
    if (mine === theirs) return 'draw'
    const leader = mine > theirs ? 0 : 1
    return config.winBy === 'fewest' ? 1 - leader : leader
  }

  return {
    sliceName: 'reversi',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['disc'],
    vocabulary: VOCABULARY,
    config,
    rules: ['placement', 'capture.custodial', 'territory.count', 'pass.forced'],

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
        passes: 0,
        lastPlaced: null,
        lastFlipped: [],
      }
    },

    validateMove(move, slice, full) {
      const playerIndex = currentPlayer(full)

      if (move.action === 'pass') {
        if (config.allowPass) return true
        if (!config.passWhenNoMoves) return false
        return movesFor(slice.board, playerIndex).length === 0
      }

      if (move.action === 'resign') return true

      const idx = move.coord
      if (!Number.isInteger(idx)) return false
      if (idx < 0 || idx >= slice.board.length) return false
      if (slice.board[idx]) return false

      const flips = flipsFor(slice.board, idx, playerIndex)
      if (config.mustFlip && flips.length === 0) return false

      return true
    },

    applyMove(move, slice, full) {
      const playerIndex = currentPlayer(full)

      if (move.action === 'pass') {
        return { ...slice, passes: slice.passes + 1, lastPlaced: null, lastFlipped: [] }
      }

      const board = [...slice.board]
      const idx = move.coord
      const flips = flipsFor(board, idx, playerIndex)

      board[idx] = { type: 'disc', owner: playerIndex }
      for (const flip of flips) {
        board[flip] = { type: 'disc', owner: playerIndex }
      }

      return {
        ...slice,
        board,
        passes: 0,
        lastPlaced: idx,
        lastFlipped: flips,
      }
    },

    getLegalMoves(slice, full) {
      const playerIndex = currentPlayer(full)
      const moves = movesFor(slice.board, playerIndex)

      if (moves.length === 0 && config.passWhenNoMoves) {
        const opponentMoves = movesFor(slice.board, 1 - playerIndex)
        if (opponentMoves.length > 0) {
          return hooks.moveFilter([{ action: 'pass' }], slice, full)
        }
      }

      return hooks.moveFilter(moves, slice, full)
    },

    checkWin(slice, full) {
      if (typeof hooks.winCondition === 'function') {
        const outcome = hooks.winCondition(slice, {
          currentPlayer: currentPlayer(full),
          discCount,
        })
        if (outcome !== null && outcome !== undefined) return outcome
      }

      const boardFull = slice.board.every(cell => cell !== null)
      const noMoves = movesFor(slice.board, 0).length === 0
        && movesFor(slice.board, 1).length === 0

      if (boardFull || noMoves) return scoreOutcome(slice.board)

      if (discCount(slice.board, 0) === 0) {
        return config.winBy === 'fewest' ? 0 : 1
      }
      if (discCount(slice.board, 1) === 0) {
        return config.winBy === 'fewest' ? 1 : 0
      }

      return null
    },
  }
}

createReversiPlugin.configKeys = CONFIG_KEYS
createReversiPlugin.interaction = 'place'
