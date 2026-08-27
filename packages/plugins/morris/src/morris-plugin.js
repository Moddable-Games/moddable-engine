import { warnUnknownConfigKeys } from '../../../core/index.js'
import { concentricRings } from '../../../topologies/graph/index.js'

export const CONFIG_KEYS = new Set([
  'diagonals', 'flying', 'flyingAt', 'fullBoardRemovesLast',
  'interleavedPlacement', 'loseAt', 'midpoints', 'millProtection',
  'millRemovesDuringPlacement', 'movement', 'piecesPerPlayer', 'playerCount',
  'rings', 'setup', 'winOnMill',
])

// The mill family. Every variant shares one shape - place, then move, form a
// line of three, remove one of theirs - and differs only in the numbers and in
// which of the four or five optional rules apply. The differences are config:
//
//   nine men's morris   9 pieces, flying at 3, mills protected
//   six men's morris    6 pieces, two rings, no spoke mills
//   twelve men's morris 12 pieces, corner diagonals, no flying
//   morabaraba          12 pieces, diagonals, flying
//   lasker morris       10 pieces, place OR move on any turn
//   shax                12 pieces, placement is peaceful, mills unprotected
//   three men's morris  3 pieces, move anywhere, a line wins outright
export function createMorrisPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    playerCount: 2,
    piecesPerPlayer: 9,
    rings: 3,
    midpoints: true,
    diagonals: false,
    movement: 'adjacent',            // 'adjacent' | 'anywhere'
    flying: true,
    flyingAt: 3,
    loseAt: 2,
    millProtection: true,            // a piece in a mill is safe while others are not
    millRemovesDuringPlacement: true, // false in shax: placement is peaceful
    interleavedPlacement: false,     // true in lasker: place or move, any turn
    winOnMill: false,                // true in three men's morris
    // Shax puts 24 pieces on a 24-point board, so placement fills it and the
    // next player has nowhere to go. Its rules cover this: the player who
    // placed last gives up the piece they just placed.
    fullBoardRemovesLast: false,
  }

  const config = { ...defaults, ...variantConfig }
  warnUnknownConfigKeys('morris', variantConfig, CONFIG_KEYS)

  let board = concentricRings(config)
  let adjacency = buildAdjacency(board)

  function buildAdjacency(b) {
    const map = new Map(b.nodes.map(n => [n, []]))
    for (const [a, c] of b.edges) {
      if (map.has(a)) map.get(a).push(c)
      if (map.has(c)) map.get(c).push(a)
    }
    return map
  }

  const currentPlayer = full => (full && full.__players ? full.__players.currentIndex : 0)
  const occupied = (slice, node) => slice.board[node]
  const isEmpty = (slice, node) => slice.board[node] == null

  function piecesOf(slice, player) {
    return board.nodes.filter(n => slice.board[n] === player)
  }

  // Every mill the player holds outright.
  function millsHeldBy(points, player) {
    return board.mills.filter(m => m.every(n => points[n] === player))
  }

  function inAnyMill(points, node, player) {
    return board.mills.some(m => m.includes(node) && m.every(n => points[n] === player))
  }

  // A mill closed by this move that was not already closed before it. Reopening
  // a mill is the whole middlegame, so this compares before and after rather
  // than remembering which mills have ever been closed.
  function newMillFormed(before, after, player) {
    const was = new Set(millsHeldBy(before, player).map(m => m.join('|')))
    return millsHeldBy(after, player).some(m => !was.has(m.join('|')))
  }

  // Which opponent pieces may be taken. Mill protection spares pieces standing
  // in a mill, but only while the opponent has pieces that are not - otherwise
  // a player whose every piece is milled could never be reduced.
  function removable(points, opponent) {
    const theirs = board.nodes.filter(n => points[n] === opponent)
    if (!config.millProtection) return theirs
    const loose = theirs.filter(n => !inAnyMill(points, n, opponent))
    return loose.length > 0 ? loose : theirs
  }

  function boardIsFull(slice) {
    return board.nodes.every(n => slice.board[n] != null)
  }

  function placementDone(slice) {
    return slice.placed.every(n => n >= config.piecesPerPlayer)
  }

  function mayFly(slice, player) {
    return config.flying && piecesOf(slice, player).length <= config.flyingAt
  }

  function destinationsFor(slice, player, from) {
    if (config.movement === 'anywhere' || mayFly(slice, player)) {
      return board.nodes.filter(n => isEmpty(slice, n))
    }
    return (adjacency.get(from) || []).filter(n => isEmpty(slice, n))
  }

  function applyToPoints(slice, move, player) {
    const points = { ...slice.board }
    if (move.action === 'place') points[move.to] = player
    else { points[move.from] = null; points[move.to] = player }
    return points
  }

  // Placement is per player, not shared. A player who has laid out all their
  // pieces starts moving even if the opponent is still placing - turns do not
  // always alternate exactly, because a mill can leave one player a placement
  // behind. Reading it globally left a player with their quota spent unable to
  // place and not yet allowed to move, which scored as a stalemate loss on a
  // board with ten empty points.
  function movesFor(slice, player) {
    const out = []
    const stillToPlace = slice.placed[player] < config.piecesPerPlayer

    if (stillToPlace) {
      for (const n of board.nodes) if (isEmpty(slice, n)) out.push({ action: 'place', to: n })
    }

    const mayMove = config.interleavedPlacement || !stillToPlace
    if (mayMove) {
      for (const from of piecesOf(slice, player)) {
        for (const to of destinationsFor(slice, player, from)) out.push({ action: 'move', from, to })
      }
    }
    return out
  }

  // A move that closes a mill carries the piece it takes, so the caller never
  // has to supply a second half-move and the AI sees the whole thing at once.
  function withRemovals(slice, player, moves) {
    const removing = config.millRemovesDuringPlacement || placementDone(slice)
    if (!removing) return moves
    const opponent = 1 - player
    const out = []
    for (const move of moves) {
      const after = applyToPoints(slice, move, player)
      if (!newMillFormed(slice.board, after, player)) { out.push(move); continue }
      const targets = removable(after, opponent)
      if (targets.length === 0) { out.push(move); continue }
      for (const remove of targets) out.push({ ...move, remove })
    }
    return out
  }

  return {
    sliceName: 'morris',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['man'],
    vocabulary: { man: { symbols: { 0: 'w', 1: 'b' } } },
    config,
    rules: ['placement', 'mill.formation', 'mill.capture'],

    init(pluginConfig, { request } = {}) {
      // The board belongs to the topology: it knows the points, the lines and
      // which triples are mills, because those follow from the structure the
      // variant declared. The plugin owns the rules and nothing else. Falling
      // back to building it here keeps the plugin usable standalone, which is
      // what the rule tests do.
      const topology = request ? request('core.topology') : null
      if (topology && typeof topology.getMills === 'function' && topology.getMills().length) {
        board = { nodes: topology.getNodes(), edges: [], mills: topology.getMills() }
        adjacency = new Map(board.nodes.map(n => [n, topology.neighbours(n)]))
      } else {
        board = concentricRings(config)
        adjacency = buildAdjacency(board)
      }
      const occupants = {}
      for (const n of board.nodes) occupants[n] = null
      return {
        board: occupants,
        placed: [0, 0],
        removed: [0, 0],
        _nodes: board.nodes,
        _mills: board.mills,
        lastMill: null,
        lastPlaced: null,
      }
    },

    getLegalMoves(slice, full) {
      const player = currentPlayer(full)
      const moves = withRemovals(slice, player, movesFor(slice, player))
      if (moves.length > 0) return moves
      if (config.fullBoardRemovesLast && slice.lastPlaced && boardIsFull(slice)) {
        return [{ action: 'forfeit', remove: slice.lastPlaced }]
      }
      return moves
    },

    validateMove(move, slice, full) {
      if (move.action === 'resign') return true
      const player = currentPlayer(full)
      return this.getLegalMoves(slice, full).some(m =>
        m.action === move.action && m.to === move.to && m.from === move.from && m.remove === move.remove)
    },

    applyMove(move, slice, full) {
      const player = currentPlayer(full)
      if (move.action === 'forfeit') {
        return { ...slice, board: { ...slice.board, [move.remove]: null }, lastMill: null, lastPlaced: null }
      }
      const points = applyToPoints(slice, move, player)
      const placed = [...slice.placed]
      const removed = [...slice.removed]
      if (move.action === 'place') placed[player]++
      if (move.remove) { points[move.remove] = null; removed[1 - player]++ }
      return { ...slice, board: points, placed, removed, lastMill: move.remove ? move.remove : null, lastPlaced: move.action === 'place' ? move.to : slice.lastPlaced }
    },

    checkWin(slice, full) {
      const player = currentPlayer(full)

      // Three men's morris ends the moment a line exists, rather than removing.
      if (config.winOnMill) {
        for (let p = 0; p < 2; p++) if (millsHeldBy(slice.board, p).length > 0) return p
      }

      // Reduced below the floor, but only once your pieces are all on the board.
      for (let p = 0; p < 2; p++) {
        if (slice.placed[p] < config.piecesPerPlayer) continue
        if (piecesOf(slice, p).length <= config.loseAt) return 1 - p
      }

      // Or stalemated: no legal move loses. A full shax board is not a
      // stalemate - the forfeit rule frees a point and play continues.
      if (movesFor(slice, player).length === 0) {
        if (config.fullBoardRemovesLast && slice.lastPlaced && boardIsFull(slice)) return null
        return 1 - player
      }
      return null
    },
  }
}

createMorrisPlugin.interaction = 'place'
createMorrisPlugin.configKeys = CONFIG_KEYS

// A morris slice holds one occupant per named point, not pieces on a grid, so
// guards that walk `slice.board` and match a piece image per occupied cell do
// not apply to it.
