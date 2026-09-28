import { warnUnknownConfigKeys } from '../../../core/index.js'

export const CONFIG_KEYS = new Set([
  'directions', 'start', 'goals', 'campLock', 'hop', 'vocabulary', 'setup',
])

// The hopping race games (engine#153): Halma on its square board and
// Stern-Halma on its star are one plugin. Nothing is captured; a piece steps to
// a neighbouring cell or hops over pieces, and a side wins by filling the camp
// it is racing to. A game is the keys below in its frontmatter.
//
//   directions   which way a piece may go, as the board names its directions
//                (a grid's `all` is the eight); a board of lattice points
//                (the star) runs its own six lines
//   start        the cells each seat's pieces start on; where absent, the
//                `setup` position, written as `cell:symbol` pairs
//   goals        the cells each seat must fill to win
//   campLock     a piece that has reached its goal may not leave it again
//   hop          adjacent (the default): over one piece next to it, onto the
//                cell beyond; long: over the first piece along a line however
//                far away, landing as far beyond it, every cell between empty
//                (Super Chinese Checkers)
//   vocabulary   the symbol each seat's pieces are written with
//
// A move is `{ from, to }`. A step goes one cell. A hop may chain, over any
// pieces, in any directions, and stop wherever the player likes, so every cell
// a chain can reach is one move; `path` lists the cells it lands on.
export function createHopPlugin(variantConfig = {}, context = {}) {
  const config = { directions: 'all', start: [], goals: [], campLock: false, hop: 'adjacent', ...variantConfig }
  warnUnknownConfigKeys('hop', variantConfig, CONFIG_KEYS)

  const names = context.definition?.players?.names || context.definition?.players || ['white', 'black']
  const seats = Math.max(2, Array.isArray(names) ? names.length : 2)

  let topology = null
  let goals = []
  let distanceToGoal = []

  // Cells as the board keys them: a grid's index, a graph's node id.
  function cellOf(ref) {
    if (Array.isArray(ref)) return topology && topology.toIndex ? topology.toIndex(ref[0], ref[1]) : ref[0] * (topology?.cols || 8) + ref[1]
    return ref
  }

  const lines = (cell) => topology.rays(cell, config.directions)
  const neighbours = (cell) => lines(cell).map(ray => ray[0]).filter(c => c !== undefined && c !== null)

  function prepare() {
    goals = Array.from({ length: seats }, (_, seat) => new Set((config.goals[seat] || []).map(cellOf)))
    // How many steps each cell is from the far tip of a seat's goal, for the
    // AI to race by. Measured to the tip rather than to the camp's edge, a
    // piece already home still gains by moving deeper, which is what leaves
    // room for the last ones in; to the edge, every home cell counted the same
    // and the last piece found the doorway blocked by its own side.
    //
    // The tip alone is not enough either: on Halma's staircase camp an empty
    // camp cell can be further from the corner than a piece standing just
    // outside it. So getting into the camp counts most, and depth within it
    // breaks the ties.
    distanceToGoal = goals.map((goal, seat) => {
      const fromStart = stepsFrom((starts()[seat] || []).map(cellOf))
      let tip = null
      for (const cell of goal) if (tip === null || (fromStart.get(cell) ?? -1) > (fromStart.get(tip) ?? -1)) tip = cell
      if (tip === null) return new Map()
      const toCamp = stepsFrom([...goal])
      const toTip = stepsFrom([tip])
      const cost = new Map()
      for (const [cell, d] of toCamp) cost.set(cell, d * 10 + (toTip.get(cell) ?? 0))
      return cost
    })
  }

  // Breadth-first steps from a set of cells to every cell.
  function stepsFrom(sources) {
    const dist = new Map()
    const queue = [...sources]
    for (const cell of sources) dist.set(cell, 0)
    while (queue.length) {
      const cell = queue.shift()
      for (const next of neighbours(cell)) {
        if (dist.has(next)) continue
        dist.set(next, dist.get(cell) + 1)
        queue.push(next)
      }
    }
    return dist
  }

  // Where each seat starts: `start` where it is given, or else the `setup`
  // position written as `cell:symbol` pairs, read with the vocabulary, so the
  // opening is written once.
  function starts() {
    if (Array.isArray(config.start) && config.start.length) return config.start
    const out = Array.from({ length: seats }, () => [])
    if (typeof config.setup !== 'string' || !config.setup.includes(':')) return out
    const owners = new Map()
    for (const entry of Object.values(config.vocabulary || {})) {
      for (const [seat, symbol] of Object.entries(entry.symbols || {})) owners.set(String(symbol), Number(seat))
    }
    for (const pair of config.setup.split(',')) {
      const [cell, symbol] = pair.split(':').map(t => t.trim())
      if (owners.has(symbol)) out[owners.get(symbol)].push(cell)
    }
    return out
  }

  function opening() {
    const board = {}
    starts().forEach((cells, seat) => {
      for (const ref of cells || []) board[cellOf(ref)] = { type: 'piece', owner: seat }
    })
    return { board, toMove: 0, winner: null }
  }

  // --- moves --------------------------------------------------------------------

  // Where one hop from `cell` can land.
  function hopsFrom(board, cell) {
    const out = []
    for (const ray of lines(cell)) {
      if (config.hop === 'long') {
        // "If a piece has N empty spaces between itself and the hurdle piece,
        // it lands N spaces beyond the hurdle."
        const k = ray.findIndex(c => board[c])
        if (k < 0) continue
        const land = 2 * k + 1
        if (land >= ray.length) continue
        if (ray.slice(k + 1, land + 1).every(c => !board[c])) out.push(ray[land])
      } else if (ray.length > 1 && board[ray[0]] && !board[ray[1]]) {
        out.push(ray[1])
      }
    }
    return out
  }

  // Every cell a chain of hops can end on, and the landings on the way.
  function chains(board, from) {
    const reached = new Map([[from, []]])
    const queue = [from]
    const lifted = { ...board }
    delete lifted[from]
    while (queue.length) {
      const here = queue.shift()
      for (const next of hopsFrom(lifted, here)) {
        if (reached.has(next)) continue
        reached.set(next, [...reached.get(here), next])
        queue.push(next)
      }
    }
    reached.delete(from)
    return reached
  }

  // Once a piece is in its goal, it stays there.
  function keepsCamp(seat, from, path) {
    if (!config.campLock) return true
    let inside = goals[seat].has(from)
    for (const cell of path) {
      const here = goals[seat].has(cell)
      if (inside && !here) return false
      inside = inside || here
    }
    return true
  }

  function legalMoves(slice) {
    if (!slice || slice.winner !== null) return []
    const seat = slice.toMove
    const moves = []
    for (const [key, piece] of Object.entries(slice.board)) {
      if (!piece || piece.owner !== seat) continue
      const from = cellKey(key)
      const seen = new Set()
      for (const to of neighbours(from)) {
        if (!slice.board[to] && keepsCamp(seat, from, [to])) { moves.push({ from, to }); seen.add(to) }
      }
      for (const [to, path] of chains(slice.board, from)) {
        if (!seen.has(to) && !slice.board[to] && keepsCamp(seat, from, path)) moves.push({ from, to, path })
      }
    }
    return moves
  }

  let numericCells = true
  const cellKey = (key) => (numericCells ? Number(key) : key)

  function filled(board, seat) {
    const goal = goals[seat]
    if (!goal.size) return false
    let mine = 0
    for (const piece of Object.values(board)) if (piece && piece.owner === seat) mine++
    for (const cell of goal) if (!board[cell] || board[cell].owner !== seat) return false
    return mine > 0
  }

  function play(move, slice) {
    const board = { ...slice.board }
    board[move.to] = board[move.from]
    delete board[move.from]
    const seat = slice.toMove
    return { ...slice, board, toMove: (seat + 1) % seats, winner: filled(board, seat) ? seat : null, lastMove: move }
  }

  // --- judgement -------------------------------------------------------------------

  // How far a side still has to go: every piece's steps to its goal.
  function remaining(board, seat) {
    let total = 0
    for (const [key, piece] of Object.entries(board)) {
      if (!piece || piece.owner !== seat) continue
      total += distanceToGoal[seat].get(cellKey(key)) ?? 999
    }
    return total
  }

  function evaluate(slice, seat) {
    if (slice.winner !== null && slice.winner !== undefined) return slice.winner === seat ? 1e6 : -1e6
    let others = 0
    for (let s = 0; s < seats; s++) if (s !== seat) others += remaining(slice.board, s)
    return others / (seats - 1) - remaining(slice.board, seat)
  }

  // The AI races: the move that brings its pieces furthest towards home, a
  // harder one also looking at its own best move after that. Pieces still
  // outside the goal are preferred to shuffling ones already in it.
  function policy(slice, seat, moves, opts = {}) {
    if (!moves.length) return null
    const difficulty = opts.difficulty || 'medium'
    if (difficulty === 'beginner') return opts.random ? moves[Math.floor(opts.random() * moves.length)] : moves[0]
    const deep = difficulty === 'hard' || difficulty === 'expert'
    const lagging = (move) => distanceToGoal[seat].get(move.from) ?? 0
    let best = moves[0]
    let bestValue = -Infinity
    for (const move of moves) {
      const after = play(move, slice)
      let value = -remaining(after.board, seat) * 10 + lagging(move) * 0.1
      if (after.winner === seat) value = Infinity
      else if (deep) {
        const again = { ...after, toMove: seat }
        let next = -Infinity
        for (const reply of legalMoves(again)) next = Math.max(next, -remaining(play(reply, again).board, seat) * 10)
        if (next > -Infinity) value = value * 0.5 + next * 0.5
      }
      if (value > bestValue) { bestValue = value; best = move }
    }
    return best
  }

  // --- the plugin ------------------------------------------------------------------

  return {
    sliceName: 'hop',
    // `play` builds every slice it returns and never writes to the one it is
    // handed; `applymove-is-pure.test.js` holds it to that.
    pureApplyMove: true,
    pieceTypes: ['piece'],
    vocabulary: config.vocabulary || { piece: { symbols: { 0: 'w', 1: 'b' } } },
    config,

    init(pluginConfig, { request } = {}) {
      topology = request ? request('core.topology') : null
      const sample = starts().flat()[0]
      numericCells = !(typeof sample === 'string')
      prepare()
      return opening()
    },

    getLegalMoves(slice) {
      return legalMoves(slice)
    },

    validateMove(move, slice) {
      if (move.action === 'resign') return true
      return legalMoves(slice).some(m => m.from === move.from && m.to === move.to)
    },

    applyMove(move, slice) {
      const legal = legalMoves(slice).find(m => m.from === move.from && m.to === move.to)
      if (!legal) return slice
      return { state: play(legal, slice) }
    },

    turnEffects(slice) {
      if (!slice || slice.winner !== null) return null
      return { next: slice.toMove }
    },

    checkWin(slice) {
      return slice && slice.winner !== null && slice.winner !== undefined ? slice.winner : null
    },

    evaluate,
    policy,

    describeSeat(slice, seat) {
      if (!slice || !slice.board) return null
      let home = 0
      for (const cell of goals[seat] || []) if (slice.board[cell]?.owner === seat) home++
      return `${home}/${goals[seat]?.size || 0} home`
    },

    describeMove(move, prev, next) {
      if (!next || !prev) return null
      const name = (cell) => {
        if (typeof cell === 'number' && topology && topology.cols) {
          return 'abcdefghijklmnopqrstuvwxyz'[cell % topology.cols] + (topology.rows - Math.floor(cell / topology.cols))
        }
        return String(cell)
      }
      const route = move.path ? [move.from, ...move.path].map(name).join('-') : `${name(move.from)}-${name(move.to)}`
      return next.winner !== null && next.winner !== undefined ? `${route} - ${names[next.winner] || next.winner} wins` : route
    },
  }
}

createHopPlugin.interaction = 'move'
createHopPlugin.configKeys = CONFIG_KEYS
