import { warnUnknownConfigKeys } from '../../../core/index.js'
import { createHexTopology } from '../../../topologies/hex/index.js'
import { connectionScore } from './connection-eval.js'

export const CONFIG_KEYS = new Set([
  'connect', 'cols', 'playerCount', 'rows', 'setup', 'shape', 'sideLength',
  'size', 'swapRule',
])

// Connection games. A turn is one stone on one empty cell, nothing moves and
// nothing is captured, and the entire game is the question of whether a
// player's stones join the edges they were asked to join.
//
//   hex   a rhombus, and each player owns one opposing pair of sides
//   y     a triangle, and whoever joins all three sides wins
//
// Neither can be drawn. Every cell is eventually filled, and on both boards a
// full board always contains exactly one winning connection, which is why
// checkWin never has to consider a stalemate.
export function createHexPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    playerCount: 2,
    shape: 'rhombus',
    connect: null,       // filled in from the shape below
    swapRule: false,     // the pie rule, offered to the second player on move two
  }

  const config = { ...defaults, ...variantConfig }
  warnUnknownConfigKeys('hex', variantConfig, CONFIG_KEYS)

  let topology = null
  let cells = []
  let edges = {}
  let targets = []
  // The evaluator walks the board tens of thousands of times per move, and
  // `topology.neighbours` builds a fresh array on every call. Built once here,
  // where the board is built, because the adjacency cannot change: no stone
  // ever moves and no cell is ever added.
  let adjacency = new Map()
  let edgeLists = {}
  const EMPTY = []

  // Which edges each player is trying to join. A rhombus gives each player one
  // opposing pair; a triangle gives both players the same three sides, so the
  // race is to be first rather than to claim a direction.
  // Which edges each player must join. Derived from the edges the board
  // actually has rather than from a shape name repeated in the variant, so a
  // triangle asks for its three sides and a rhombus splits its four into two
  // opposing pairs.
  function connectionTargets(names) {
    if (config.connect) return config.connect
    if (names.includes('base')) return [['left', 'right', 'base'], ['left', 'right', 'base']]
    return [['north', 'south'], ['west', 'east']]
  }

  // The board comes from the topology, which already knows the shape and its
  // named edges because the variant declared them there. Building one here is
  // the standalone fallback the rule tests use.
  function buildBoard(provided) {
    topology = provided && typeof provided.getEdges === 'function'
      ? provided
      : createHexTopology(config)
    // getAllCells already hands back the topology's own key strings.
    cells = topology.getAllCells()
    const named = topology.getEdges()
    edges = {}
    for (const [name, list] of Object.entries(named)) edges[name] = new Set(list.map(c => `${c.q},${c.r}`))
    targets = connectionTargets(Object.keys(edges))
    adjacency = new Map()
    for (const cell of cells) adjacency.set(cell, topology.neighbours(cell))
    edgeLists = {}
    for (const [name, set] of Object.entries(edges)) edgeLists[name] = [...set]
  }

  const currentPlayer = full => (full && full.__players ? full.__players.currentIndex : 0)

  // Flood fill from one edge through the player's own stones, then ask whether
  // every other edge they need was reached. Run on demand rather than
  // maintained incrementally: these boards top out at 361 cells, and a union
  // find that is wrong is worse than a scan that is slow.
  function connects(board, player) {
    const need = targets[player] || []
    if (need.length < 2) return false
    const start = edges[need[0]]
    if (!start) return false

    const seen = new Set()
    const queue = []
    for (const cell of start) if (board[cell] === player) { queue.push(cell); seen.add(cell) }
    // Nothing of this player's on the starting edge means nothing to search.
    if (queue.length === 0) return false

    while (queue.length) {
      const cell = queue.pop()
      // The cached adjacency, not `topology.neighbours`, which parses the
      // "q,r" key out of a string and builds a fresh array every call. This
      // loop runs on every ply of every rollout.
      const around = adjacency.get(cell) || EMPTY
      for (let i = 0; i < around.length; i++) {
        const next = around[i]
        if (seen.has(next) || board[next] !== player) continue
        seen.add(next)
        queue.push(next)
      }
    }

    for (let i = 1; i < need.length; i++) {
      const edge = edgeLists[need[i]]
      if (!edge) return false
      let reached = false
      for (let j = 0; j < edge.length; j++) {
        if (seen.has(edge[j])) { reached = true; break }
      }
      if (!reached) return false
    }
    return true
  }

  return {
    sliceName: 'hex',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['stone'],
    vocabulary: { stone: { symbols: { 0: 'b', 1: 'w' } } },
    config,
    rules: ['placement', 'connection'],

    init(pluginConfig, { request } = {}) {
      buildBoard(request ? request('core.topology') : null)
      const board = {}
      for (const cell of cells) board[cell] = null
      return { board, moves: 0, swapped: false, _cells: cells, _edges: Object.keys(edges) }
    },

    getLegalMoves(slice, full) {
      // One pass. `filter().map()` builds two arrays of up to 121 entries each,
      // on every ply of every rollout.
      const moves = []
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        if (slice.board[cell] == null) moves.push({ action: 'place', to: cell })
      }
      // The pie rule: after the opening stone the second player may take it
      // over instead of replying, which is what stops a strong first move from
      // deciding the game.
      if (config.swapRule && slice.moves === 1 && !slice.swapped) moves.push({ action: 'swap' })
      return moves
    },

    validateMove(move, slice, full) {
      if (move.action === 'resign') return true
      if (move.action === 'swap') return config.swapRule && slice.moves === 1 && !slice.swapped
      return move.action === 'place' && slice.board[move.to] === null
    },

    applyMove(move, slice, full) {
      const player = currentPlayer(full)
      if (move.action === 'swap') {
        const board = { ...slice.board }
        for (const cell of cells) if (board[cell] != null) board[cell] = player
        return { ...slice, board, moves: slice.moves + 1, swapped: true, lastPlayer: player }
      }
      // Who moved, so the win check does not have to flood fill for a player
      // who cannot possibly have just completed a connection.
      return { ...slice, board: { ...slice.board, [move.to]: player }, moves: slice.moves + 1, lastPlayer: player }
    },

    checkWin(slice) {
      // A connection is completed by placing a stone, so only the player who
      // just placed one can have completed it. Testing both, on every ply of
      // every rollout, was the single largest cost in a Hex search at 27% of
      // the profile: two flood fills over the whole board where one will do,
      // and one of them for a player who had not moved.
      //
      // A slice with no `lastPlayer` has not been moved in yet - a loaded
      // position, or the opening - so both are still checked.
      if (typeof slice.lastPlayer === 'number') {
        return connects(slice.board, slice.lastPlayer) ? slice.lastPlayer : null
      }
      for (let player = 0; player < 2; player++) if (connects(slice.board, player)) return player
      return null
    },

    // The search asks the plugin what a position is worth, because nothing
    // outside the plugin knows which edges this board has or who is trying to
    // join them. Without it the family had no evaluator at all and the search
    // was choosing between moves it scored identically.
    evaluate(slice, playerIndex) {
      if (!slice || !slice.board || !targets.length) return 0
      return connectionScore(slice.board, playerIndex, targets, edges, adjacency, cells)
    },
  }
}

createHexPlugin.interaction = 'place'
createHexPlugin.configKeys = CONFIG_KEYS

// Minimax has nothing to prune on a board where every legal move is a stone on
// an empty cell and the branching factor is the number of empty cells, so the
// search is best first over the distance evaluation instead.
createHexPlugin.mcts = true

// A hex rollout has to fill the board before it produces a result: nothing is
// captured, no player can pass, and a position is only decided once someone's
// edges are joined. The default cut-off of 100 plies is shorter than the 121
// cells of the standard board, so every rollout on the board most people play
// was being abandoned before it could say anything.
createHexPlugin.searchPolicies = () => ({ maxRolloutDepth: 400 })

// Stones sit on named hex cells rather than grid squares, so guards that place
// one piece image per grid cell do not apply.
