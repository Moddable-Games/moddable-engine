import { warnUnknownConfigKeys } from '../../../core/index.js'

export const CONFIG_KEYS = new Set([
  'routes', 'seatRoutes', 'shortcuts', 'pieces', 'start', 'throw', 'bearOff', 'bearOffFrom',
  'contact', 'safe', 'rethrow', 'captureRethrow', 'pairsSafe', 'blockade', 'mustStop',
  'sendBack', 'stack', 'whenBlocked', 'setup', 'vocabulary',
])

// The race games (engine#151): throw a randomiser, move one piece along a
// route, and something happens where it lands. The Royal Game of Ur, Senet
// and Nyout are one plugin, and a game is the keys below in its frontmatter.
//
// A route is not a topology. The board is whatever the game draws - Ur's and
// Senet's grids, Nyout's circle of stations - and a route is an ordered list of
// its cells that a piece walks along:
//
//   routes        named routes, each a list of cells: [row, col] on a grid,
//                 a node id on a graph
//   seatRoutes    the route each seat's pieces enter on, one per seat; one
//                 name for every seat when they share it
//   shortcuts     [{ at, take }]: a piece that starts its move on `at` may walk
//                 route `take` instead, from `at`'s place on it. Nyout's corners
//                 and centre
//   pieces        pieces per seat
//   start         cells each seat's pieces start on; any not placed wait in
//                 reserve and enter with a throw
//   throw         { lots, scores, again, bank }: `lots` two-sided lots are
//                 thrown (sticks, tetrahedral dice) and the number showing
//                 their marked side is looked up in `scores` (the count itself
//                 where absent). A score in `again` throws again: after moving,
//                 or at once and banked with the rest when `bank` is set
//   bearOff       exact (the throw must carry the piece one past the end) or
//                 over (reaching or passing the end is enough)
//   bearOffFrom   the only cells a piece may bear off from
//   contact       capture (the piece landed on goes back to reserve) or swap
//                 (it goes to the cell the mover came from)
//   safe          cells where a piece cannot be landed on by an opponent
//   rethrow       cells that give another throw to a piece landing there
//   captureRethrow  a capture gives another throw
//   pairsSafe     two of a side's pieces next to each other along the route
//                 cannot be landed on
//   blockade      this many of a side's pieces in a row cannot be passed
//   mustStop      cells a piece must land on before it may go past them
//   sendBack      { from, to }: a piece landing on `from` goes to `to`, or the
//                 nearest empty cell before it
//   stack         a piece landing on its own side joins it, and they move on
//                 together
//   whenBlocked   backward: with no move forward, a piece steps back to the
//                 nearest empty cell behind it instead
//   vocabulary    the symbol each seat's pieces are written with, so the
//                 game's piece set draws them
//
// A move is `{ action: 'throw' }`, then one move per throw: `{ from, to, throw }`
// along the board, `{ action: 'enter', to, throw }` from reserve, or a bear-off
// named as an action. A throw that names its `value` is played as that throw,
// which is how a search weighs every outcome through `chanceOutcomes`.
export function createRacePlugin(variantConfig = {}, context = {}) {
  const config = {
    routes: {},
    shortcuts: [],
    pieces: 7,
    start: null,
    throw: { lots: 4 },
    bearOff: 'exact',
    contact: 'capture',
    safe: [],
    rethrow: [],
    captureRethrow: false,
    pairsSafe: false,
    blockade: 0,
    mustStop: [],
    sendBack: null,
    stack: false,
    whenBlocked: null,
    ...variantConfig,
  }
  warnUnknownConfigKeys('race', variantConfig, CONFIG_KEYS)

  const names = context.definition?.players?.names || context.definition?.players || ['white', 'black']
  const seats = Math.max(2, Array.isArray(names) ? names.length : 2)
  const lots = Number(config.throw?.lots) || 4
  const scores = config.throw?.scores || {}
  const againOn = new Set((config.throw?.again || []).map(Number))
  const bank = Boolean(config.throw?.bank)

  let topology = null
  let rng = null

  // Cells as the board keys them: a grid's index, a graph's node id.
  function cellOf(ref) {
    if (Array.isArray(ref)) return topology && topology.toIndex ? topology.toIndex(ref[0], ref[1]) : ref[0] * (topology?.cols || 8) + ref[1]
    return ref
  }

  // Built once the topology is known, because a grid cell's key comes from it.
  let routes = null
  let cellSet = {}
  function prepare() {
    routes = {}
    for (const [name, list] of Object.entries(config.routes || {})) routes[name] = list.map(cellOf)
    const setOf = (list) => new Set((list || []).map(cellOf))
    cellSet = {
      safe: setOf(config.safe),
      rethrow: setOf(config.rethrow),
      mustStop: setOf(config.mustStop),
      bearOffFrom: config.bearOffFrom ? setOf(config.bearOffFrom) : null,
    }
  }

  function routeFor(seat) {
    const spec = config.seatRoutes
    if (Array.isArray(spec)) return spec[seat] ?? spec[0]
    return spec || Object.keys(routes)[0]
  }

  const score = (marked) => (scores[marked] !== undefined ? Number(scores[marked]) : marked)

  // --- the position ------------------------------------------------------------

  // A cell holds `{ type, owner, count, route }`: whose pieces, how many (more
  // than one only where pieces stack), and the route they are walking, which
  // is what tells Nyout's centre which way a piece goes on.
  function opening() {
    const board = {}
    const reserve = new Array(seats).fill(Number(config.pieces) || 0)
    const starts = config.start || config.setup || null
    if (Array.isArray(starts)) {
      starts.forEach((cells, seat) => {
        for (const ref of cells || []) {
          const cell = cellOf(ref)
          const here = board[cell]
          board[cell] = here ? { ...here, count: here.count + 1 } : { type: 'piece', owner: seat, count: 1, route: routeFor(seat) }
          reserve[seat]--
        }
      })
    }
    return {
      board,
      reserve,
      off: new Array(seats).fill(0),
      toMove: 0,
      phase: 'throw',
      throws: [],
      again: false,
      lastThrow: null,
      winner: null,
    }
  }

  const indexOn = (route, cell) => routes[route] ? routes[route].indexOf(cell) : -1

  // Where `n` steps from index `idx` on a route lands: a cell, 'off', or null
  // where the move is not allowed. Index -1 is the reserve.
  function landing(route, idx, n) {
    const path = routes[route]
    const target = idx + n
    // "A throw that would carry a piece past square 26 without first stopping
    // there is illegal for that piece."
    for (let i = idx + 1; i < Math.min(target, path.length); i++) {
      if (cellSet.mustStop.has(path[i])) return null
    }
    if (target < path.length) return path[target]
    if (idx >= 0 && cellSet.bearOffFrom && !cellSet.bearOffFrom.has(path[idx])) return null
    if (idx < 0) return null
    if (target === path.length) return 'off'
    return config.bearOff === 'over' ? 'off' : null
  }

  // A run of `blockade` or more of one side's pieces along the route, which
  // the other side may not pass.
  function passesBlockade(board, route, idx, target, seat) {
    if (!config.blockade) return false
    const path = routes[route]
    let run = 0
    for (let i = Math.max(0, idx + 1); i < Math.min(target, path.length); i++) {
      const cell = board[path[i]]
      run = cell && cell.owner !== seat ? run + 1 : 0
      if (run >= config.blockade) return true
    }
    return false
  }

  // Whether an opponent piece on `cell` may be landed on.
  function exposed(board, route, cell) {
    const piece = board[cell]
    if (cellSet.safe.has(cell)) return false
    if (config.pairsSafe) {
      const path = routes[route]
      const i = path.indexOf(cell)
      for (const j of [i - 1, i + 1]) {
        const next = j >= 0 && j < path.length ? board[path[j]] : null
        if (next && next.owner === piece.owner) return false
      }
    }
    return true
  }

  // --- moves --------------------------------------------------------------------

  // Where a piece standing on `cell`, walking `route`, may go with a throw of
  // `n`: along its own route, and along any shortcut that starts where it
  // stands.
  function stepsFrom(board, seat, cell, route, n) {
    const options = [{ route, idx: indexOn(route, cell) }]
    for (const cut of config.shortcuts || []) {
      if (cellOf(cut.at) !== cell || cut.take === route || !routes[cut.take]) continue
      options.push({ route: cut.take, idx: indexOn(cut.take, cell) })
    }
    const moves = []
    for (const { route: r, idx } of options) {
      if (idx < 0) continue
      const to = landing(r, idx, n)
      if (to === null) continue
      if (to !== 'off' && passesBlockade(board, r, idx, idx + n, seat)) continue
      if (to !== 'off' && !mayLand(board, seat, r, to)) continue
      moves.push({ from: cell, to, throw: n, route: r })
    }
    return moves
  }

  function mayLand(board, seat, route, cell) {
    const here = board[cell]
    if (!here) return true
    if (here.owner === seat) return Boolean(config.stack)
    return exposed(board, route, cell)
  }

  function enterMoves(slice, seat, n) {
    if (!slice.reserve[seat]) return []
    const route = routeFor(seat)
    const to = landing(route, -1, n)
    if (to === null || to === 'off') return []
    if (!mayLand(slice.board, seat, route, to)) return []
    return [{ action: 'enter', to, throw: n, route }]
  }

  // Senet: "If your only legal move would land on a square occupied by your
  // own piece, you must instead move one of your pieces backward to the
  // nearest empty square."
  function backwardMoves(slice, seat, n) {
    const moves = []
    for (const [key, piece] of Object.entries(slice.board)) {
      if (!piece || piece.owner !== seat) continue
      const cell = cellKey(key)
      const path = routes[piece.route]
      for (let i = path.indexOf(cell) - 1; i >= 0; i--) {
        if (slice.board[path[i]]) continue
        moves.push({ from: cell, to: path[i], throw: n, route: piece.route, back: true })
        break
      }
    }
    return moves
  }

  // Board keys come back from Object.entries as strings; a grid's cells are
  // numbers.
  const cellKey = (key) => (typeof routeCellSample() === 'number' ? Number(key) : key)
  function routeCellSample() {
    for (const list of Object.values(routes)) if (list.length) return list[0]
    return null
  }

  function movesForThrow(slice, seat, n) {
    const moves = [...enterMoves(slice, seat, n)]
    for (const [key, piece] of Object.entries(slice.board)) {
      if (!piece || piece.owner !== seat) continue
      moves.push(...stepsFrom(slice.board, seat, cellKey(key), piece.route, n))
    }
    return moves
  }

  // Every move the side to move has with the throws it holds. A throw of
  // nothing moves nothing.
  function pieceMoves(slice) {
    const seat = slice.toMove
    const moves = []
    for (const n of [...new Set(slice.throws)]) {
      if (n > 0) moves.push(...movesForThrow(slice, seat, n))
    }
    if (!moves.length && config.whenBlocked === 'backward') {
      for (const n of [...new Set(slice.throws)]) if (n > 0) moves.push(...backwardMoves(slice, seat, n))
    }
    return nameBearOffs(moves)
  }

  // A piece borne off leaves no cell to click, so the move is an action. Named
  // for the piece where there is more than one to choose from.
  function nameBearOffs(moves) {
    const offs = moves.filter(m => m.to === 'off')
    return moves.map(m => {
      if (m.to !== 'off') return m
      const { from, ...rest } = m
      return { ...rest, action: offs.length > 1 ? `bear off ${cellName(from)} (${m.throw})` : 'bear off', piece: from, to: undefined }
    }).map(m => (m.to === undefined ? withoutUndefined(m) : m))
  }

  function withoutUndefined(m) {
    const out = {}
    for (const [k, v] of Object.entries(m)) if (v !== undefined) out[k] = v
    return out
  }

  function cellName(cell) {
    if (typeof cell === 'number' && topology && topology.cols) {
      const r = Math.floor(cell / topology.cols)
      return 'abcdefghijklmnopqrstuvwxyz'[cell % topology.cols] + (topology.rows - r)
    }
    return String(cell)
  }

  // --- playing a move -----------------------------------------------------------

  function throwValue(move) {
    if (move.value !== undefined) return Number(move.value)
    let marked = 0
    // Without the game's generator - a plugin built outside a game - every lot
    // falls the same way rather than reaching for an unseeded one.
    for (let i = 0; i < lots; i++) if ((rng ? rng.next() : 0.4) < 0.5) marked++
    return score(marked)
  }

  function nextSeat(seat) {
    return (seat + 1) % seats
  }

  // The turn after a move: more throws to play, a throw earned, or the next
  // side's turn.
  function settle(slice) {
    if (slice.winner !== null) return { ...slice, phase: 'done' }
    if (slice.throws.length && pieceMoves(slice).length) return { ...slice, phase: 'move' }
    if (slice.again) return { ...slice, phase: 'throw', throws: [], again: false }
    return { ...slice, phase: 'throw', throws: [], again: false, toMove: nextSeat(slice.toMove) }
  }

  function playThrow(move, slice) {
    const n = throwValue(move)
    const throws = [...slice.throws, n]
    const earned = againOn.has(n)
    const next = { ...slice, throws, lastThrow: n }
    // Nyout: "When a Yut or Mo is thrown, the player takes an additional throw
    // immediately", and plays the throws afterwards.
    if (bank && earned) return { ...next, phase: 'throw' }
    // "If no legal move exists, the turn is forfeited", and with it any throw
    // the throw itself would have earned.
    if (!pieceMoves(next).length) return { ...next, phase: 'throw', throws: [], again: false, toMove: nextSeat(slice.toMove) }
    return settle({ ...next, again: slice.again || earned })
  }

  function playPiece(move, slice) {
    const seat = slice.toMove
    const board = { ...slice.board }
    const reserve = slice.reserve.slice()
    const off = slice.off.slice()
    let again = slice.again
    let moving
    const from = move.action === 'enter' ? null : (move.piece !== undefined ? move.piece : move.from)
    if (from === null) {
      reserve[seat]--
      moving = { type: 'piece', owner: seat, count: 1, route: move.route }
    } else {
      moving = { ...board[from], route: move.route }
      delete board[from]
    }
    const to = move.action === 'enter' ? move.to : (move.piece !== undefined ? 'off' : move.to)
    if (to === 'off') {
      off[seat] += moving.count
    } else {
      const here = board[to]
      if (here && here.owner === seat) {
        moving = { ...moving, count: moving.count + here.count }
      } else if (here) {
        if (config.contact === 'swap' && from !== null) {
          board[from] = { ...here, route: here.route }
        } else {
          reserve[here.owner] += here.count
        }
        if (config.captureRethrow) again = true
      }
      board[to] = moving
      if (cellSet.rethrow.has(to)) again = true
      if (config.sendBack && cellOf(config.sendBack.from) === to) sendBack(board, to)
    }
    const throws = slice.throws.slice()
    throws.splice(throws.indexOf(move.throw), 1)
    const winner = off[seat] >= (Number(config.pieces) || 0) ? seat : null
    return settle({ ...slice, board, reserve, off, throws, again, winner, lastMove: move })
  }

  // Senet's House of Water: "sent back to square 15 (or the nearest empty
  // square before 15 if occupied)".
  function sendBack(board, cell) {
    const piece = board[cell]
    const path = routes[piece.route]
    const target = cellOf(config.sendBack.to)
    for (let i = path.indexOf(target); i >= 0; i--) {
      if (board[path[i]]) continue
      delete board[cell]
      board[path[i]] = piece
      return
    }
  }

  function legalMoves(slice) {
    if (!slice || slice.phase === 'done') return []
    if (slice.phase === 'throw') return [{ action: 'throw' }]
    return pieceMoves(slice)
  }

  function sameMove(a, b) {
    return a.action === b.action && a.from === b.from && a.to === b.to && a.piece === b.piece &&
      (a.throw === undefined ? b.throw === undefined : Number(a.throw) === Number(b.throw)) && (a.route === undefined || b.route === undefined || a.route === b.route)
  }

  function play(move, slice) {
    if (move.action === 'throw') return playThrow(move, slice)
    return playPiece(move, slice)
  }

  // --- chance, judgement and words ----------------------------------------------

  // Every throw and how likely it is: `lots` fair two-sided lots, so the count
  // showing is binomial, and equal scores are one outcome.
  function throwOutcomes() {
    const byValue = new Map()
    let ways = 1
    for (let k = 0; k <= lots; k++) {
      const value = score(k)
      byValue.set(value, (byValue.get(value) || 0) + ways / 2 ** lots)
      ways = ways * (lots - k) / (k + 1)
    }
    return [...byValue].map(([value, probability]) => ({ value, probability }))
  }

  const routeLength = (seat) => (routes[routeFor(seat)] || []).length

  // How far a side still has to go: the steps left on each piece's route, and
  // the whole route plus one for each piece waiting to enter.
  function distance(slice, seat) {
    let left = slice.reserve[seat] * (routeLength(seat) + 1)
    for (const [key, piece] of Object.entries(slice.board)) {
      if (!piece || piece.owner !== seat) continue
      const path = routes[piece.route] || []
      left += piece.count * (path.length - path.indexOf(cellKey(key)))
    }
    return left
  }

  function evaluate(slice, seat) {
    if (slice.winner !== null && slice.winner !== undefined) return slice.winner === seat ? 1e6 : -1e6
    let value = 0
    for (let s = 0; s < seats; s++) value += (s === seat ? -1 : 1 / (seats - 1)) * distance(slice, s)
    // A piece that cannot be landed on is worth something beyond its place.
    for (const [key, piece] of Object.entries(slice.board)) {
      if (!piece) continue
      const guarded = !exposed(slice.board, piece.route, cellKey(key))
      if (guarded) value += piece.owner === seat ? 2 : -2
    }
    return value
  }

  // The AI plays each throw as it comes, choosing the move that leaves the
  // best position; a harder AI also weighs the reply every throw allows.
  function policy(slice, seat, moves, opts = {}) {
    if (!moves.length) return null
    const difficulty = opts.difficulty || 'medium'
    // Randomness comes from the caller's seeded source, or there is none.
    if (difficulty === 'beginner') return opts.random ? moves[Math.floor(opts.random() * moves.length)] : moves[0]
    if (slice.phase === 'throw') return moves[0]
    const deep = difficulty === 'hard' || difficulty === 'expert'
    let best = moves[0]
    let bestValue = -Infinity
    for (const move of moves) {
      const after = play(move, slice)
      let value = evaluate(after, seat)
      if (deep && after.toMove !== seat && after.phase === 'throw') value = replyValue(after, seat)
      if (value > bestValue) { bestValue = value; best = move }
    }
    return best
  }

  // What the position is worth once the opponent has thrown and answered as
  // well as they can, over every throw.
  function replyValue(slice, seat) {
    let total = 0
    for (const { value, probability } of throwOutcomes()) {
      const thrown = playThrow({ action: 'throw', value }, slice)
      const replies = thrown.phase === 'move' && thrown.toMove !== seat ? pieceMoves(thrown) : []
      let worst = evaluate(thrown, seat)
      for (const reply of replies) worst = Math.min(worst, evaluate(play(reply, thrown), seat))
      total += probability * worst
    }
    return total
  }

  function describeAction(move, prev, next) {
    if (move.action === 'throw') {
      const n = next.lastThrow
      return next.toMove !== prev.toMove ? `throw ${n}, no move` : `throw ${n}`
    }
    const took = prev.board[move.to] && prev.board[move.to].owner !== prev.toMove ? (config.contact === 'swap' ? ' swaps' : '*') : ''
    if (move.action === 'enter') return `enter ${cellName(move.to)}${took}`
    if (move.piece !== undefined) return `${cellName(move.piece)} off`
    return `${cellName(move.from)}-${cellName(move.to)}${took}${move.back ? ' (back)' : ''}`
  }

  // --- the plugin ------------------------------------------------------------------

  return {
    sliceName: 'race',
    // `play` builds every slice it returns and never writes to the one it is
    // handed; `applymove-is-pure.test.js` holds it to that.
    pureApplyMove: true,
    pieceTypes: ['piece'],
    vocabulary: config.vocabulary || { piece: { symbols: { 0: 'w', 1: 'b' } } },
    config,

    init(pluginConfig, { request } = {}) {
      topology = request ? request('core.topology') : null
      rng = request ? request('core.rng') : null
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
      const next = play(move.action === 'throw' ? move : legal, slice)
      return { state: next, continueTurn: next.phase !== 'done' && next.toMove === slice.toMove }
    },

    // Who acts next is the plugin's to say: a throw earned keeps the turn.
    turnEffects(slice) {
      if (!slice || slice.phase === 'done') return null
      return { next: slice.toMove }
    },

    checkWin(slice) {
      return slice && slice.winner !== null && slice.winner !== undefined ? slice.winner : null
    },

    chanceOutcomes(move) {
      if (move.action !== 'throw') return null
      return throwOutcomes().map(({ value, probability }) => ({ move: { ...move, value }, probability }))
    },

    evaluate,
    policy,

    describeSeat(slice, seat) {
      if (!slice || !slice.reserve) return null
      const parts = []
      if (slice.reserve[seat]) parts.push(`${slice.reserve[seat]} to enter`)
      if (slice.off[seat]) parts.push(`${slice.off[seat]} off`)
      // A stack is drawn as one piece, so the count is said here.
      for (const [key, piece] of Object.entries(slice.board)) {
        if (piece && piece.owner === seat && piece.count > 1) parts.push(`${piece.count} stacked on ${cellName(cellKey(key))}`)
      }
      if (slice.toMove === seat && slice.throws.length) parts.push(`to play ${slice.throws.join(' ')}`)
      return parts.join(' · ')
    },

    describeMove(move, prev, next) {
      if (!next || !prev) return null
      const text = describeAction(move, prev, next)
      return next.winner !== null && next.winner !== undefined ? `${text} - ${names[next.winner] || next.winner} wins` : text
    },
  }
}

createRacePlugin.interaction = 'move'
createRacePlugin.configKeys = CONFIG_KEYS
