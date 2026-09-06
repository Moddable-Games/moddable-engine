import { warnUnknownConfigKeys } from '../../../core/index.js'
import { scoreGame } from './scoring.js'
import { createGoPlayoutPolicy, createGoExpansionPolicy } from './playout-policy.js'
// Every config key this plugin reads. Exported so the corpus guard and the
// authoring docs share one source of truth, and kept separate from `defaults`,
// which only lists the keys that carry a default value.
export const CONFIG_KEYS = new Set([
  'allowPass', 'autoScore', 'boardSize', 'captureTarget', 'captures', 'cols', 'evaluate',
  'handicap', 'komi', 'playerColours', 'rows', 'scoring', 'setup', 'suicideAllowed',
  'superko', 'turnLogic', 'winCondition',
])


// b and w match the vocabulary the go hub declares in moddable-rules, so the
// symbol a stone serialises to is the one the piece set resolves. cellStrings
// maps owner index to the raw string the plugin stores on the board, so the
// topology can round-trip string cells through FEN - and so a `setup` written
// as a FEN parses straight into the board the plugin keeps.
const VOCABULARY = {
  stone: { symbols: { 0: 'b', 1: 'w' }, cellStrings: ['black', 'white'] },
}

export function createGoPlugin(variantConfig = {}, context = {}) {
  const { definition } = context

  const defaults = {
    komi: 6.5,
    scoring: 'territory',
    suicideAllowed: false,
    superko: false,
    captures: true,
    allowPass: true,
    captureTarget: null,
  }

  const config = { ...defaults, ...variantConfig }

  warnUnknownConfigKeys('go', variantConfig, CONFIG_KEYS)

  const playerColours = config.playerColours || ['black', 'white']

  const hooks = {
    init: defaultInit,
    validateMove: defaultValidateMove,
    applyMove: defaultApplyMove,
    getLegalMoves: defaultGetLegalMoves,
    checkWin: defaultCheckWin,
    moveFilter: passthrough,
    captureEffect: defaultCaptureEffect,
    continueTurn: () => false,
    turnAdvancement: null,
    beforeMove: noop,
    afterMove: noop,
    ...variantConfig.hooks,
  }

  let topology = null

  // Go was the one family that could not open from a position. `setup` was in
  // CONFIG_KEYS and read nowhere, so every variant started from an empty board
  // however its frontmatter opened, and Sunjang Baduk's sixteen pre-placed
  // stones and Tibetan Go's twelve were declared and discarded (engine#162).
  //
  // The stones are written as an ordinary position string and parsed by the
  // topology, the same path every other family uses, which is why the plugin
  // needs no notion of what a handicap or an opening pattern is.
  function openingBoard(pluginConfig, boardSize) {
    const empty = new Array(boardSize).fill(null)
    const setup = pluginConfig.setup || config.setup
    if (!setup || !topology || !topology.parsePosition) return empty

    const cells = topology.parsePosition(setup, VOCABULARY)
    // A shorter position leaves the rest of the board empty rather than
    // shrinking it: the board's size is the topology's business, not the FEN's.
    for (let i = 0; i < Math.min(cells.length, boardSize); i++) {
      if (cells[i]) empty[i] = cells[i]
    }
    return empty
  }

  function defaultInit(pluginConfig, { request }) {
    topology = request('core.topology')
    let boardSize
    if (topology) {
      boardSize = topology.size
    } else {
      const dim = pluginConfig.size || 19
      boardSize = dim * dim
    }
    const cols = topology && topology.cols
      ? topology.cols
      : (pluginConfig.cols || pluginConfig.size || Math.round(Math.sqrt(boardSize)))
    const rows = topology && topology.rows
      ? topology.rows
      : (pluginConfig.rows || Math.round(boardSize / cols))

    return {
      board: openingBoard(pluginConfig, boardSize),
      passes: 0,
      ko: null,
      captures: { 0: 0, 1: 0 },
      komi: config.komi,
      scoring: config.scoring,
      previousStates: config.superko ? [] : null,
      rows,
      cols,
      lastPlaced: null,
      lastCaptureBy: null,
      deadStones: [],
      playerColours,
    }
  }

  function defaultValidateMove(move, slice, full) {
    if (move.action === 'pass') return config.allowPass !== false
    if (move.action === 'resign') return true

    const coord = move.coord
    if (coord < 0 || coord >= slice.board.length) return false
    if (slice.board[coord] !== null) return false
    if (coord === slice.ko) return false

    if (!config.suicideAllowed) {
      if (wouldBeSuicide(coord, slice, full)) return false
    }

    if (config.superko && slice.previousStates && violatesSuperko(coord, slice, full)) {
      return false
    }

    return true
  }

  function violatesSuperko(coord, slice, full) {
    const { board } = simulatePlacement(coord, slice, full)
    return slice.previousStates.includes(boardKey(board))
  }

  // The same question asked against a set built once, rather than a linear scan
  // of the history for every candidate on the board. The history grows as the
  // game goes on, so the old shape was cells times history, per move
  // generation.
  function violatesSuperkoIn(previous, board) {
    return previous.has(boardKey(board))
  }

  function simulatePlacement(coord, slice, full) {
    const board = [...slice.board]
    const playerIndex = full && full.__players ? full.__players.currentIndex : 0
    const currentColour = playerColours[playerIndex]
    const opponentColour = playerColours[1 - playerIndex]
    board[coord] = currentColour
    const captured = config.captures === false
      ? []
      : hooks.captureEffect(coord, board, opponentColour, slice)
    return { board, captured, playerIndex }
  }

  function defaultApplyMove(move, slice, full) {
    const result = hooks.beforeMove(move, slice, full)
    if (result !== undefined) slice = result

    if (move.action === 'pass') {
      return { ...slice, passes: slice.passes + 1, ko: null }
    }

    if (move.action === 'resign') {
      return slice
    }

    const board = [...slice.board]
    const playerIndex = full.__players.currentIndex
    const currentColour = playerColours[playerIndex]
    const opponentColour = playerColours[1 - playerIndex]

    board[move.coord] = currentColour

    const captured = config.captures === false
      ? []
      : hooks.captureEffect(move.coord, board, opponentColour, slice)
    const captureCount = captured.length
    const captures = { ...slice.captures }
    captures[playerIndex] = (captures[playerIndex] || 0) + captureCount

    const ko = determineKo(captured, move.coord, board)

    let previousStates = slice.previousStates
    if (config.superko && previousStates) {
      previousStates = [...previousStates, boardKey(slice.board)]
    }

    const newSlice = {
      ...slice,
      board,
      passes: 0,
      ko,
      captures,
      previousStates,
      lastPlaced: move.coord,
      lastCaptureBy: captureCount > 0 ? playerIndex : null,
    }

    hooks.afterMove(move, newSlice, full)
    return newSlice
  }

  function defaultCaptureEffect(coord, board, opponentColour, slice) {
    const captured = []
    const neighbours = topology ? topology.neighbours(coord) : gridNeighbours(coord, slice)

    for (const n of neighbours) {
      if (board[n] === opponentColour) {
        if (!hasLiberties(n, board, slice)) {
          const { group } = getGroupCells(n, board, slice)
          for (const s of group) {
            board[s] = null
            captured.push(s)
          }
        }
      }
    }
    return captured
  }

  function defaultGetLegalMoves(slice, full) {
    const moves = config.allowPass === false ? [] : [{ action: 'pass' }]

    const previous = (config.superko && slice.previousStates)
      ? new Set(slice.previousStates)
      : null
    const annotates = config.captures !== false

    for (let i = 0; i < slice.board.length; i++) {
      if (slice.board[i] !== null || i === slice.ko) continue
      if (!config.suicideAllowed && wouldBeSuicide(i, slice, full)) continue

      // One simulation per candidate. The superko test and the capture
      // annotation both need to know what the board would look like after this
      // stone, and each used to work it out for itself, so every playable point
      // was simulated twice on the way to being offered once.
      const sim = (previous || annotates) ? simulatePlacement(i, slice, full) : null

      if (previous && violatesSuperkoIn(previous, sim.board)) continue

      if (!annotates || sim.captured.length === 0) moves.push({ coord: i })
      else moves.push({ coord: i, wouldCapture: true, captures: sim.captured })
    }

    return hooks.moveFilter(moves, slice, full)
  }

  function annotateMove(coord, slice, full) {
    if (config.captures === false) return { coord }
    const { captured } = simulatePlacement(coord, slice, full)
    if (captured.length === 0) return { coord }
    return { coord, wouldCapture: true, captures: captured }
  }

  function defaultCheckWin(slice, full) {
    if (typeof config.winCondition === 'function') {
      const outcome = config.winCondition(slice, {
        currentPlayer: full && full.__players ? full.__players.currentIndex : 0,
      })
      if (outcome !== null && outcome !== undefined) return outcome
    }

    if (config.captureTarget) {
      if ((slice.captures[0] || 0) >= config.captureTarget) return 0
      if ((slice.captures[1] || 0) >= config.captureTarget) return 1
    }

    if (config.allowPass !== false && slice.passes >= 2) {
      if (config.autoScore === true) return score(slice).winner
      return 'scoring'
    }

    return null
  }

  function score(slice, opts = {}) {
    return scoreGame(slice, {
      getNeighbours: (pos) => neighboursOf(pos, slice),
      method: opts.method || config.scoring || slice.scoring,
      komi: opts.komi !== undefined ? opts.komi : (slice.komi !== undefined ? slice.komi : config.komi),
      deadStones: opts.deadStones || slice.deadStones || [],
      captures: slice.captures,
    })
  }

  function neighboursOf(pos, slice) {
    return topology ? topology.neighbours(pos) : gridNeighbours(pos, slice)
  }

  function passthrough(moves) { return moves }
  function noop() {}

  function wouldBeSuicide(coord, slice, full) {
    const board = [...slice.board]
    const playerIndex = full.__players.currentIndex
    const currentColour = playerColours[playerIndex]
    const opponentColour = playerColours[1 - playerIndex]

    board[coord] = currentColour

    const neighbours = topology ? topology.neighbours(coord) : gridNeighbours(coord, slice)
    for (const n of neighbours) {
      if (board[n] === opponentColour) {
        if (!hasLibertiesOnBoard(n, board, slice)) {
          return false
        }
      }
    }

    return !hasLibertiesOnBoard(coord, board, slice)
  }

  function hasLiberties(coord, board, slice) {
    return hasLibertiesOnBoard(coord, board, slice)
  }

  function hasLibertiesOnBoard(coord, board, slice) {
    const colour = board[coord]
    if (!colour) return true
    const visited = new Set()
    const stack = [coord]
    while (stack.length > 0) {
      const pos = stack.pop()
      if (visited.has(pos)) continue
      visited.add(pos)
      const neighbours = topology ? topology.neighbours(pos) : gridNeighbours(pos, slice)
      for (const n of neighbours) {
        if (board[n] === null) return true
        if (board[n] === colour && !visited.has(n)) stack.push(n)
      }
    }
    return false
  }

  function getGroupCells(coord, board, slice) {
    const colour = board[coord]
    if (!colour) return { group: new Set(), boundary: new Set() }

    if (topology && topology.getGroup) {
      return topology.getGroup(coord, c => board[c] === colour)
    }

    const group = new Set()
    const boundary = new Set()
    const stack = [coord]
    group.add(coord)
    while (stack.length > 0) {
      const pos = stack.pop()
      const neighbours = gridNeighbours(pos, slice)
      for (const n of neighbours) {
        if (group.has(n)) continue
        if (board[n] === colour) {
          group.add(n)
          stack.push(n)
        } else {
          boundary.add(n)
        }
      }
    }
    return { group, boundary }
  }

  function gridNeighbours(idx, slice) {
    if (topology && topology.neighbours) return topology.neighbours(idx)
    const cols = slice._cols || Math.round(Math.sqrt(slice.board.length))
    const rows = Math.round(slice.board.length / cols)
    const row = Math.floor(idx / cols)
    const col = idx % cols
    const n = []
    if (row > 0) n.push(idx - cols)
    if (row < rows - 1) n.push(idx + cols)
    if (col > 0) n.push(idx - 1)
    if (col < cols - 1) n.push(idx + 1)
    return n
  }

  function determineKo(captured, playedCoord, board) {
    if (captured.length !== 1) return null
    return captured[0]
  }

  // One character per point, for the superko history.
  //
  // This was `board.map(...).join('')`, which allocates an array of 361
  // one-character strings and throws it away, and it is called once per
  // candidate move per move generation. It was the single largest cost in a Go
  // search, at a quarter of the whole profile.
  function boardKey(board) {
    let key = ''
    for (let i = 0; i < board.length; i++) {
      const cell = board[i]
      key += cell === null ? '.' : cell[0]
    }
    return key
  }

  return {
    sliceName: 'go',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['stone'],
    vocabulary: VOCABULARY,
    config,

    init(pluginConfig, capabilities) {
      return hooks.init(pluginConfig, capabilities)
    },

    validateMove(move, slice, full) {
      return hooks.validateMove(move, slice, full)
    },

    applyMove(move, slice, full) {
      return hooks.applyMove(move, slice, full)
    },

    getLegalMoves(slice, full) {
      return hooks.getLegalMoves(slice, full)
    },

    checkWin(slice, full) {
      return hooks.checkWin(slice, full)
    },

    score(slice, opts) {
      return score(slice, opts)
    },

    evaluate(slice, playerIndex) {
      if (typeof config.evaluate === 'function') return config.evaluate(slice, playerIndex)
      return null
    },

    markDead(slice, deadStones) {
      return { ...slice, deadStones }
    },
  }
}

// MCTS rollout and expansion policies for this family. sdk.js used to test
// `family === 'go'` for these, which left a new territorial game no way to
// bring its own.
createGoPlugin.searchPolicies = ({ random } = {}) => ({
  rolloutPolicy: createGoPlayoutPolicy(random),
  expansionPolicy: createGoExpansionPolicy(),
})

createGoPlugin.configKeys = CONFIG_KEYS
createGoPlugin.interaction = 'place'
createGoPlugin.mcts = true
