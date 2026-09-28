import { warnUnknownConfigKeys } from '../../../core/index.js'

export const CONFIG_KEYS = new Set([
  'directions', 'start', 'goals', 'campLock', 'hop', 'vocabulary', 'setup',
  'seats', 'noMovesLoses', 'fewerThan',
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
//   seats        what each seat's pieces may do, where the seats differ
//                (engine#154, Asalto). Per seat:
//                  steps: all, or { rows: [...] } - the row changes a step may
//                    make, so [-1, 0] is forward or sideways towards row 0
//                  hops: any (over any piece, nothing taken), capture (over an
//                    enemy only, which is taken; a chain never jumps a piece
//                    twice), or none
//   noMovesLoses a side with no move on its turn has lost (the Officers,
//                hemmed in)
//   fewerThan    per seat, the number of pieces below which that seat has
//                lost (the Soldiers, too few to fill the fortress)
//
// A move is `{ from, to }`. A step goes one cell. A hop may chain, over any
// pieces, in any directions, and stop wherever the player likes, so every cell
// a chain can reach is one move; `path` lists the cells it lands on.
export function createHopPlugin(variantConfig = {}, context = {}) {
  const config = { directions: 'all', start: [], goals: [], campLock: false, hop: 'adjacent', seats: [], noMovesLoses: false, fewerThan: [], ...variantConfig }
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

  const seatRules = (seat) => ({ steps: 'all', hops: 'any', ...(config.seats[seat] || {}) })

  // Whether a step's row change is one the seat may make.
  function stepAllowed(rules, from, to) {
    if (!rules.steps || rules.steps === 'all') return true
    const rows = rules.steps.rows
    if (!Array.isArray(rows) || !topology.toRC) return true
    const a = topology.toRC(from), b = topology.toRC(to)
    return Boolean(a && b) && rows.includes(Math.sign(b[0] - a[0]))
  }

  // Capturing chains: each jump takes the enemy it passes over, and the chain
  // may stop after any jump. Every sequence is its own move.
  function captureChains(board, from, seat) {
    const out = []
    const walk = (at, current, path, taken) => {
      for (const ray of lines(at)) {
        if (ray.length < 2) continue
        const over = ray[0], land = ray[1]
        const victim = current[over]
        if (!victim || victim.owner === seat || current[land]) continue
        const next = { ...current }
        delete next[over]
        next[land] = next[at]
        delete next[at]
        const step = { to: land, path: [...path, land], captures: [...taken, over] }
        out.push(step)
        walk(land, next, step.path, step.captures)
      }
    }
    walk(from, board, [], [])
    return out
  }

  function movesFor(slice, seat) {
    const rules = seatRules(seat)
    const moves = []
    for (const [key, piece] of Object.entries(slice.board)) {
      if (!piece || piece.owner !== seat) continue
      const from = cellKey(key)
      const seen = new Set()
      for (const to of neighbours(from)) {
        if (!slice.board[to] && stepAllowed(rules, from, to) && keepsCamp(seat, from, [to])) { moves.push({ from, to }); seen.add(to) }
      }
      if (rules.hops === 'capture') {
        for (const chain of captureChains(slice.board, from, seat)) moves.push({ from, ...chain })
      } else if (rules.hops !== 'none') {
        for (const [to, path] of chains(slice.board, from)) {
          if (!seen.has(to) && !slice.board[to] && keepsCamp(seat, from, path)) moves.push({ from, to, path })
        }
      }
    }
    return moves
  }

  function legalMoves(slice) {
    if (!slice || slice.winner !== null) return []
    return movesFor(slice, slice.toMove)
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

  const piecesOf = (board, seat) => Object.values(board).filter(p => p && p.owner === seat).length

  function play(move, slice) {
    const board = { ...slice.board }
    board[move.to] = board[move.from]
    delete board[move.from]
    for (const cell of move.captures || []) delete board[cell]
    const seat = slice.toMove
    const lastBySeat = { ...(slice.lastBySeat || {}), [seat]: { from: move.from, to: move.to } }
    const next = { ...slice, board, toMove: (seat + 1) % seats, winner: null, lastMove: move, lastBySeat }
    if (filled(board, seat)) return { ...next, winner: seat }
    // A seat reduced below its threshold has lost; with two seats, the other
    // has won.
    for (let s = 0; s < seats; s++) {
      const floor = Number(config.fewerThan[s])
      if (floor && piecesOf(board, s) < floor) return { ...next, winner: seats === 2 ? 1 - s : seat }
    }
    if (config.noMovesLoses && !movesFor(next, next.toMove).length) return { ...next, winner: seats === 2 ? 1 - next.toMove : seat }
    return next
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

  // A game where pieces are taken is judged on more than the race: the
  // pieces each side has, how far any side with a goal still has to go, and
  // how much room each side has to move.
  const fights = config.seats.some(rules => rules && rules.hops === 'capture')

  function fightValue(slice, seat) {
    if (slice.winner !== null && slice.winner !== undefined) return slice.winner === seat ? 1e6 : -1e6
    let value = 0
    for (let s = 0; s < seats; s++) {
      const sign = s === seat ? 1 : -1
      value += sign * 30 * piecesOf(slice.board, s)
      // A side with a goal races for it. A side without one fights for room:
      // the Soldiers only advance, so counting their own moves would teach
      // them to hang back, while the Officers live or die by theirs.
      if (goals[s].size) value -= sign * stillToFill(slice.board, s)
      else value += sign * 3 * movesFor({ ...slice, toMove: s }, s).length
    }
    return value
  }

  // How far a side is from filling its goal: each open goal cell, and for each
  // piece outside, the steps to the nearest open one. Distance to the goal as
  // a whole says nothing once its edge is full - a piece beside a full camp
  // is "one step away" wherever it stands.
  function stillToFill(board, seat) {
    const open = [...goals[seat]].filter(cell => !board[cell])
    if (!open.length) return 0
    const toOpen = stepsFrom(open)
    let total = open.length * 6
    for (const [key, piece] of Object.entries(board)) {
      if (!piece || piece.owner !== seat || goals[seat].has(cellKey(key))) continue
      total += toOpen.get(cellKey(key)) ?? 20
    }
    return total
  }

  // Undoing its own last move gains nothing, and two sides doing it forever
  // is a game that never ends.
  const undoes = (slice, seat, move) => {
    const last = slice.lastBySeat?.[seat]
    return Boolean(last && last.from === move.to && last.to === move.from)
  }

  // Two plies: each move, answered by the reply that is worst for this side.
  function fightPolicy(slice, seat, moves, deep) {
    let best = moves[0]
    let bestValue = -Infinity
    for (const move of moves) {
      const after = play(move, slice)
      let value = fightValue(after, seat) - (undoes(slice, seat, move) ? 20 : 0)
      if (after.winner === null) {
        const replies = movesFor(after, after.toMove)
        const answers = deep ? replies : replies.filter(r => r.captures)
        for (const reply of answers) value = Math.min(value, fightValue(play(reply, after), seat))
      }
      if (value > bestValue) { bestValue = value; best = move }
    }
    return best
  }

  // The AI races: the move that brings its pieces furthest towards home, a
  // harder one also looking at its own best move after that. Pieces still
  // outside the goal are preferred to shuffling ones already in it.
  function policy(slice, seat, moves, opts = {}) {
    if (!moves.length) return null
    const difficulty = opts.difficulty || 'medium'
    if (difficulty === 'beginner') return opts.random ? moves[Math.floor(opts.random() * moves.length)] : moves[0]
    if (fights) return fightPolicy(slice, seat, moves, difficulty === 'hard' || difficulty === 'expert')
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

  // Two moves from and to the same cells differ only in what they capture.
  function sameMove(a, b) {
    if (a.from !== b.from || a.to !== b.to) return false
    if (!b.captures) return true
    return (a.captures || []).join(',') === b.captures.join(',')
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
      return legalMoves(slice).some(m => sameMove(m, move))
    },

    applyMove(move, slice) {
      const legal = legalMoves(slice).find(m => sameMove(m, move))
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
