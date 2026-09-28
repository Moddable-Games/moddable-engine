import { warnUnknownConfigKeys } from '../../../core/index.js'

export const CONFIG_KEYS = new Set([
  'routes', 'seatRoutes', 'shortcuts', 'pieces', 'start', 'throw', 'enterWith', 'enterAt',
  'bearOff', 'bearOffFrom', 'contact', 'safe', 'rethrow', 'captureRethrow', 'pairsSafe',
  'blockade', 'mustStop', 'sendBack', 'stack', 'immunity', 'whenBlocked', 'teams',
  'teamOrder', 'captureToFinish', 'mayDecline', 'setup', 'vocabulary',
])

// The race games (engine#151, #152): throw something, move a piece along a
// route, and something happens where it lands. The Royal Game of Ur, Senet,
// Nyout, Pachisi and Chaupar are one plugin, and a game is the keys below in
// its frontmatter.
//
// A route is not a topology. The board is whatever the game draws - Ur's and
// Senet's grids, Nyout's circle of stations, Pachisi's cross - and a route is
// an ordered list of its cells that a piece walks along. A cell may appear on
// a route twice (Pachisi goes down its middle column and comes back up it), so
// a piece remembers how far along its route it is, not only where it stands.
//
//   routes        named routes, each a list of cells: [row, col] on a grid,
//                 a node id on a graph
//   seatRoutes    the route each seat's pieces walk, one per seat, or a list
//                 of routes for a seat that runs more than one (two-player
//                 Pachisi runs two opposite arms); one name for every seat
//                 when they share it
//   shortcuts     [{ at, take }]: a piece that starts its move on `at` may walk
//                 route `take` instead, from `at`'s place on it. Nyout
//   pieces        pieces on each route a seat walks
//   start         the cells each seat's pieces start on; the rest wait in
//                 reserve and enter by a throw
//   throw         lots: { lots, scores, again, bank } - that many two-sided lots
//                 (sticks, shells, tetrahedral dice), the number showing their
//                 marked side looked up in `scores` (the count itself where
//                 absent); a score in `again` throws again, after moving, or at
//                 once and banked with the rest when `bank` is set.
//                 dice: { dice: [[faces], ...], split } - the faces of each die,
//                 which need not be 1 to 6; `split` lets the dice be shared
//                 among pieces in any grouping
//   enterWith     the throws that may bring a piece in; any, where absent
//   enterAt       first: an entering piece is put on the route's first cell
//                 and the throw goes no further; throw (the default): it is
//                 moved the throw's length from before the first cell
//   bearOff       exact (the throw must carry the piece one past the end) or
//                 over (reaching or passing the end is enough)
//   bearOffFrom   the only cells a piece may bear off from
//   contact       capture (the pieces landed on go back to reserve) or swap
//                 (they go to the cell the mover came from)
//   safe          cells where a piece cannot be landed on by an opponent
//   rethrow       cells that give another throw to a piece landing there
//   captureRethrow  a capture gives another throw
//   pairsSafe     two of a side's pieces next to each other along the route
//                 cannot be landed on
//   blockade      this many of a side's pieces in a row cannot be passed
//   mustStop      cells a piece must land on before it may go past them
//   sendBack      { from, to }: a piece landing on `from` goes to `to`, or the
//                 nearest empty cell before it
//   stack         share: a side's pieces may stand together and still move one
//                 at a time; together: pieces that meet move on as one
//   immunity      size: pieces standing together can only be taken by at
//                 least as many arriving together
//   whenBlocked   backward: with no move forward, a piece steps back to the
//                 nearest empty cell behind it instead
//   teams         seats that win together, all of them home; with `teamOrder`
//                 a seat may bear off only once the seats before it in its
//                 team have finished
//   captureToFinish  a seat may not bear off until it has captured something
//   mayDecline    a player may refuse to move after throwing (Pachisi: "A
//                 player may refuse to move any counter on his or her turn")
//   vocabulary    the symbol each seat's pieces are written with, so the
//                 game's piece set draws them
//
// A move is `{ action: 'throw' }`, then moves that spend the throws: `{ from,
// to, throw }` along the board, `{ action: 'enter', to, throw }` from reserve,
// or a bear-off named as an action. A throw that names what fell (`value` for
// lots, `dice` for dice) is played as that fall, which is how a search weighs
// every outcome through `chanceOutcomes`.
export function createRacePlugin(variantConfig = {}, context = {}) {
  const config = {
    routes: {},
    shortcuts: [],
    pieces: 7,
    start: null,
    throw: { lots: 4 },
    enterAt: 'throw',
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
    immunity: null,
    whenBlocked: null,
    teams: null,
    teamOrder: false,
    captureToFinish: false,
    mayDecline: false,
    ...variantConfig,
  }
  warnUnknownConfigKeys('race', variantConfig, CONFIG_KEYS)

  const names = context.definition?.players?.names || context.definition?.players || ['white', 'black']
  const seats = Math.max(2, Array.isArray(names) ? names.length : 2)
  const throwSpec = config.throw || { lots: 4 }
  const dice = Array.isArray(throwSpec.dice) ? throwSpec.dice.map(faces => faces.map(Number)) : null
  const split = Boolean(dice && throwSpec.split)
  const lots = Number(throwSpec.lots) || 4
  const scores = throwSpec.scores || {}
  const againOn = new Set((throwSpec.again || []).map(Number))
  const bank = Boolean(throwSpec.bank)
  const enterWith = Array.isArray(config.enterWith) ? new Set(config.enterWith.map(Number)) : null
  // `stack: true` is Nyout's horse, which moves together.
  const stacking = config.stack === true ? 'together' : (config.stack || null)
  const piecesPerRoute = Number(config.pieces) || 0

  let topology = null
  let rng = null

  // Cells as the board keys them: a grid's index, a graph's node id.
  function cellOf(ref) {
    if (Array.isArray(ref)) return topology && topology.toIndex ? topology.toIndex(ref[0], ref[1]) : ref[0] * (topology?.cols || 8) + ref[1]
    return ref
  }

  // Built once the topology is known, because a grid cell's key comes from it.
  let routes = {}
  let cellSet = {}
  let numericCells = true
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
    const sample = Object.values(routes).find(list => list.length)
    numericCells = !sample || typeof sample[0] === 'number'
  }

  // Board keys come back from Object.entries as strings; a grid's are numbers.
  const cellKey = (key) => (numericCells ? Number(key) : key)

  function routesFor(seat) {
    const spec = config.seatRoutes
    const own = Array.isArray(spec) ? (spec[seat] ?? spec[0]) : (spec || Object.keys(routes)[0])
    return Array.isArray(own) ? own : [own]
  }

  // --- the position ------------------------------------------------------------

  // A cell holds `{ type, owner, count, items }`: whose pieces, how many, and
  // for each piece the route it walks and how far along it is (`step`). Most
  // cells hold one piece; Pachisi's and Nyout's hold more.
  const cellFrom = (owner, items) => ({ type: 'piece', owner, count: items.length, items })

  function reserveTotal(slice, seat) {
    return Object.values(slice.reserve[seat] || {}).reduce((sum, n) => sum + n, 0)
  }

  function piecesOf(seat) {
    return piecesPerRoute * routesFor(seat).length
  }

  // Which of a seat's routes a starting cell is on, and how far along.
  function placeOnRoute(seat, cell) {
    for (const route of routesFor(seat)) {
      const step = (routes[route] || []).indexOf(cell)
      if (step >= 0) return { route, step }
    }
    return null
  }

  function opening() {
    const board = {}
    const reserve = Array.from({ length: seats }, (_, seat) =>
      Object.fromEntries(routesFor(seat).map(route => [route, piecesPerRoute])))
    const starts = config.start || config.setup || null
    if (Array.isArray(starts)) {
      starts.forEach((cells, seat) => {
        for (const ref of cells || []) {
          const cell = cellOf(ref)
          const item = placeOnRoute(seat, cell)
          if (!item) continue
          const here = board[cell]
          board[cell] = cellFrom(seat, [...(here ? here.items : []), item])
          reserve[seat][item.route]--
        }
      })
    }
    return {
      board,
      reserve,
      off: new Array(seats).fill(0),
      captured: new Array(seats).fill(false),
      toMove: 0,
      phase: 'throw',
      throws: [],
      again: false,
      lastThrow: null,
      winner: null,
    }
  }

  // Where `n` steps from `step` on a route lands: a cell, 'off', or null where
  // the move is not allowed. Step -1 is the reserve.
  function landing(route, step, n) {
    const path = routes[route]
    const target = step + n
    // "A throw that would carry a piece past square 26 without first stopping
    // there is illegal for that piece."
    for (let i = step + 1; i < Math.min(target, path.length); i++) {
      if (cellSet.mustStop.has(path[i])) return null
    }
    if (target < path.length) return { cell: path[target], step: target }
    if (step < 0) return null
    if (cellSet.bearOffFrom && !cellSet.bearOffFrom.has(path[step])) return null
    if (target === path.length || config.bearOff === 'over') return { cell: 'off', step: path.length }
    return null
  }

  // A run of `blockade` or more of one side's pieces along the route, which
  // the other side may not pass.
  function passesBlockade(board, route, step, target, seat) {
    if (!config.blockade) return false
    const path = routes[route]
    let run = 0
    for (let i = Math.max(0, step + 1); i < Math.min(target, path.length); i++) {
      const cell = board[path[i]]
      run = cell && cell.owner !== seat ? run + 1 : 0
      if (run >= config.blockade) return true
    }
    return false
  }

  // Whether the pieces on `cell` may be landed on by `arriving` of the mover's.
  function exposed(board, cell, arriving) {
    const here = board[cell]
    if (cellSet.safe.has(cell)) return false
    // Chaupar: a double "is vulnerable to double, triple, or quadruple".
    if (config.immunity === 'size' && arriving < here.count) return false
    if (config.pairsSafe) {
      const { route, step } = here.items[0]
      const path = routes[route] || []
      for (const j of [step - 1, step + 1]) {
        const next = j >= 0 && j < path.length ? board[path[j]] : null
        if (next && next.owner === here.owner) return false
      }
    }
    return true
  }

  function mayLand(board, seat, cell, arriving, item) {
    const here = board[cell]
    if (!here) return true
    if (here.owner === seat) {
      if (!stacking) return false
      // Nyout's horse takes whoever it meets along with it.
      if (stacking === 'together') return true
      // Pieces that merely share a cell must be going the same way: one
      // leaving a column and one coming home up it are not together.
      return here.items.every(other => other.route === item.route && other.step === item.step)
    }
    return exposed(board, cell, arriving)
  }

  // --- moves --------------------------------------------------------------------

  // The pieces on a cell that can move, one group per way they are going. A
  // stack that moves together is one group; pieces that share a cell each go
  // on their own.
  function groupsOn(cell) {
    if (stacking === 'together') return [{ items: cell.items, item: cell.items[0] }]
    const seen = new Map()
    for (const item of cell.items) {
      const key = `${item.route}|${item.step}`
      if (!seen.has(key)) seen.set(key, { items: [item], item })
    }
    return [...seen.values()]
  }

  // Where a group standing on `cell` may go with a throw of `n`: along its own
  // route, and along any shortcut that starts where it stands.
  function stepsFrom(slice, seat, cell, group, n) {
    const { item } = group
    const options = [{ route: item.route, step: item.step }]
    for (const cut of config.shortcuts || []) {
      if (cellOf(cut.at) !== cell || cut.take === item.route || !routes[cut.take]) continue
      const step = routes[cut.take].indexOf(cell)
      if (step >= 0) options.push({ route: cut.take, step })
    }
    const moves = []
    for (const { route, step } of options) {
      const to = landing(route, step, n)
      if (!to) continue
      if (to.cell === 'off') {
        if (mayBearOff(slice, seat)) moves.push({ from: cell, to: 'off', throw: n, route, step: item.step })
        continue
      }
      if (passesBlockade(slice.board, route, step, to.step, seat)) continue
      if (!mayLand(slice.board, seat, to.cell, group.items.length, { route, step: to.step })) continue
      moves.push({ from: cell, to: to.cell, throw: n, route, step: item.step })
    }
    return moves
  }

  // Chaupar's tohd and home order: some seats may not finish yet.
  function mayBearOff(slice, seat) {
    if (config.captureToFinish && !slice.captured[seat]) return false
    if (config.teamOrder && Array.isArray(config.teams)) {
      const team = config.teams.find(t => t.includes(seat)) || []
      for (const before of team.slice(0, team.indexOf(seat))) {
        if (slice.off[before] < piecesOf(before)) return false
      }
    }
    return true
  }

  function enterMoves(slice, seat, n) {
    if (enterWith && !enterWith.has(n)) return []
    const moves = []
    for (const route of routesFor(seat)) {
      if (!(slice.reserve[seat]?.[route] > 0)) continue
      const to = config.enterAt === 'first' ? { cell: routes[route][0], step: 0 } : landing(route, -1, n)
      if (!to || to.cell === 'off') continue
      if (!mayLand(slice.board, seat, to.cell, 1, { route, step: to.step })) continue
      moves.push({ action: 'enter', to: to.cell, throw: n, route })
    }
    return moves
  }

  // Senet: "If your only legal move would land on a square occupied by your
  // own piece, you must instead move one of your pieces backward to the
  // nearest empty square."
  function backwardMoves(slice, seat, n) {
    const moves = []
    for (const [key, cell] of Object.entries(slice.board)) {
      if (!cell || cell.owner !== seat) continue
      for (const { item } of groupsOn(cell)) {
        const path = routes[item.route]
        for (let i = item.step - 1; i >= 0; i--) {
          if (slice.board[path[i]]) continue
          moves.push({ from: cellKey(key), to: path[i], throw: n, route: item.route, step: item.step, back: true })
          break
        }
      }
    }
    return moves
  }

  function movesForThrow(slice, seat, n) {
    const moves = [...enterMoves(slice, seat, n)]
    for (const [key, cell] of Object.entries(slice.board)) {
      if (!cell || cell.owner !== seat) continue
      for (const group of groupsOn(cell)) moves.push(...stepsFrom(slice, seat, cellKey(key), group, n))
    }
    return moves
  }

  // What the throws in hand allow: each throw on its own, or with split dice
  // every sum of some of them, each move naming the dice it spends.
  function spendable(throws) {
    if (!split) return [...new Set(throws)].filter(n => n > 0).map(n => ({ n, dice: null }))
    const out = new Map()
    const count = throws.length
    for (let mask = 1; mask < 1 << count; mask++) {
      const used = throws.filter((_, i) => mask & (1 << i)).sort((a, b) => a - b)
      const n = used.reduce((a, b) => a + b, 0)
      if (n > 0) out.set(used.join(','), { n, dice: used })
    }
    return [...out.values()]
  }

  // Every move the side to move has with the throws it holds.
  function pieceMoves(slice) {
    const seat = slice.toMove
    const moves = []
    for (const { n, dice: used } of spendable(slice.throws)) {
      for (const move of movesForThrow(slice, seat, n)) moves.push(used ? { ...move, dice: used } : move)
    }
    if (!moves.length && config.whenBlocked === 'backward') {
      for (const { n } of spendable(slice.throws)) moves.push(...backwardMoves(slice, seat, n))
    }
    if (moves.length && config.mayDecline) moves.push({ action: 'pass' })
    return nameBearOffs(moves)
  }

  // A piece borne off leaves no cell to click, so the move is an action. Named
  // for the piece where there is more than one to choose from.
  function nameBearOffs(moves) {
    const offs = moves.filter(m => m.to === 'off')
    return moves.map(m => {
      if (m.to !== 'off') return m
      const { from, to: _to, ...rest } = m
      return { ...rest, action: offs.length > 1 ? `bear off ${cellName(from)} (${m.throw})` : 'bear off', piece: from }
    })
  }

  function cellName(cell) {
    if (typeof cell === 'number' && topology && topology.cols) {
      const r = Math.floor(cell / topology.cols)
      return 'abcdefghijklmnopqrstuvwxyz'[cell % topology.cols] + (topology.rows - r)
    }
    return String(cell)
  }

  // --- playing a move -----------------------------------------------------------

  // Without the game's generator - a plugin built outside a game - every lot
  // and die falls the same way rather than reaching for an unseeded one.
  const draw = () => (rng ? rng.next() : 0.4)

  const score = (marked) => (scores[marked] !== undefined ? Number(scores[marked]) : marked)

  // What a throw puts in hand: one score for lots or unsplit dice, each die's
  // face for dice that may be split.
  function thrown(move) {
    if (dice) {
      const faces = Array.isArray(move.dice) && move.dice.length === dice.length
        ? move.dice.map(Number)
        : dice.map(faces => faces[Math.floor(draw() * faces.length)])
      return split ? faces : [faces.reduce((a, b) => a + b, 0)]
    }
    if (move.value !== undefined) return [Number(move.value)]
    let marked = 0
    for (let i = 0; i < lots; i++) if (draw() < 0.5) marked++
    return [score(marked)]
  }

  function nextSeat(seat) {
    return (seat + 1) % seats
  }

  function passTurn(slice) {
    return { ...slice, phase: 'throw', throws: [], again: false, toMove: nextSeat(slice.toMove) }
  }

  // The turn after a move: more throws to play, a throw earned, or the next
  // side's turn.
  function settle(slice) {
    if (slice.winner !== null) return { ...slice, phase: 'done' }
    if (slice.throws.length && pieceMoves(slice).length) return { ...slice, phase: 'move' }
    if (slice.again) return { ...slice, phase: 'throw', throws: [], again: false }
    return passTurn(slice)
  }

  function playThrow(move, slice) {
    const fell = thrown(move)
    const throws = [...slice.throws, ...fell]
    const earned = !dice && againOn.has(fell[0])
    const next = { ...slice, throws, lastThrow: dice ? fell : fell[0] }
    // Nyout: "When a Yut or Mo is thrown, the player takes an additional throw
    // immediately", and plays the throws afterwards.
    if (bank && earned) return { ...next, phase: 'throw' }
    // "If no legal move exists, the turn is forfeited", and with it any throw
    // the throw itself would have earned.
    if (!pieceMoves(next).length) return passTurn(next)
    return settle({ ...next, again: slice.again || earned })
  }

  function winnerAfter(off) {
    if (Array.isArray(config.teams)) {
      const team = config.teams.find(t => t.every(seat => off[seat] >= piecesOf(seat)))
      return team ? team[0] : null
    }
    const seat = off.findIndex((n, s) => n >= piecesOf(s))
    return seat >= 0 ? seat : null
  }

  function playPiece(move, slice) {
    const seat = slice.toMove
    const board = { ...slice.board }
    const reserve = slice.reserve.map(r => ({ ...r }))
    const off = slice.off.slice()
    const captured = slice.captured.slice()
    let again = slice.again
    const entering = move.action === 'enter'
    const from = entering ? null : (move.piece !== undefined ? move.piece : move.from)
    const bearing = move.piece !== undefined
    let moving
    if (entering) {
      reserve[seat][move.route]--
      moving = [{ route: move.route, step: -1 }]
    } else {
      const here = board[from]
      // The piece that moves is the one at the move's step; the route may be a
      // shortcut it is turning onto.
      const group = stacking === 'together'
        ? here.items
        : [here.items.find(item => item.step === move.step && item.route === move.route) || here.items.find(item => item.step === move.step) || here.items[0]]
      const left = here.items.filter(item => !group.includes(item))
      if (left.length) board[from] = cellFrom(seat, left)
      else delete board[from]
      moving = group
    }
    const to = entering ? move.to : (bearing ? 'off' : move.to)
    const route = move.route
    if (to === 'off') {
      off[seat] += moving.length
    } else {
      const step = landedStep(move, moving)
      const arriving = moving.map(() => ({ route, step }))
      const here = board[to]
      if (here && here.owner === seat) {
        board[to] = cellFrom(seat, stacking === 'together'
          ? [...here.items, ...arriving].map(() => ({ route, step }))
          : [...here.items, ...arriving])
      } else {
        if (here) {
          if (config.contact === 'swap' && from !== null) {
            // The piece landed on goes back to where the mover stood.
            board[from] = cellFrom(here.owner, here.items.map(item => ({ ...item, step: routes[item.route].indexOf(from) })))
          } else {
            for (const item of here.items) reserve[here.owner][item.route] = (reserve[here.owner][item.route] || 0) + 1
          }
          captured[seat] = true
          if (config.captureRethrow) again = true
        }
        board[to] = cellFrom(seat, arriving)
      }
      if (cellSet.rethrow.has(to)) again = true
      if (config.sendBack && cellOf(config.sendBack.from) === to) sendBack(board, to)
    }
    const throws = spend(slice.throws, move)
    return settle({ ...slice, board, reserve, off, captured, throws, again, winner: winnerAfter(off), lastMove: move })
  }

  // How far along its route a moved piece now is.
  function landedStep(move, moving) {
    if (move.action === 'enter') return config.enterAt === 'first' ? 0 : move.throw - 1
    if (move.back) return routes[move.route].lastIndexOf(move.to, moving[0].step - 1)
    // Along a shortcut the walk starts from where the corner sits on it.
    const start = moving[0].route === move.route ? move.step : routes[move.route].indexOf(move.from)
    return start + move.throw
  }

  function spend(throws, move) {
    const left = throws.slice()
    for (const n of move.dice || [move.throw]) {
      const i = left.indexOf(n)
      if (i >= 0) left.splice(i, 1)
    }
    return left
  }

  // Senet's House of Water: "sent back to square 15 (or the nearest empty
  // square before 15 if occupied)".
  function sendBack(board, cell) {
    const here = board[cell]
    const { route } = here.items[0]
    const path = routes[route]
    const target = cellOf(config.sendBack.to)
    for (let i = path.indexOf(target); i >= 0; i--) {
      if (board[path[i]]) continue
      delete board[cell]
      board[path[i]] = cellFrom(here.owner, here.items.map(item => ({ ...item, step: i })))
      return
    }
  }

  function legalMoves(slice) {
    if (!slice || slice.phase === 'done') return []
    if (slice.phase === 'throw') return [{ action: 'throw' }]
    return pieceMoves(slice)
  }

  function sameMove(a, b) {
    const sameList = (x, y) => (x || []).join(',') === (y || []).join(',')
    return a.action === b.action && a.from === b.from && a.to === b.to && a.piece === b.piece &&
      (a.throw === undefined ? b.throw === undefined : Number(a.throw) === Number(b.throw)) &&
      (a.route === undefined || b.route === undefined || a.route === b.route) &&
      (a.step === undefined || b.step === undefined || a.step === b.step) &&
      (a.action === 'throw' || sameList(a.dice, b.dice))
  }

  function play(move, slice) {
    if (move.action === 'throw') return playThrow(move, slice)
    // Refusing spends every throw in hand; a throw it earned still stands.
    if (move.action === 'pass') return settle({ ...slice, throws: [] })
    return playPiece(move, slice)
  }

  // --- chance, judgement and words ----------------------------------------------

  // Every throw and how likely it is. Lots are fair and two-sided, so the
  // count showing is binomial; dice are each fair over their own faces. Falls
  // that play the same are one outcome.
  function throwOutcomes() {
    const out = new Map()
    if (dice) {
      let falls = [[]]
      for (const faces of dice) falls = falls.flatMap(fall => faces.map(face => [...fall, face]))
      for (const fall of falls) {
        const key = split ? fall.slice().sort((a, b) => a - b).join(',') : String(fall.reduce((a, b) => a + b, 0))
        const entry = out.get(key) || { fall: split ? fall.slice().sort((a, b) => a - b) : fall, probability: 0 }
        entry.probability += 1 / falls.length
        out.set(key, entry)
      }
      return [...out.values()].map(({ fall, probability }) => ({ move: { action: 'throw', dice: fall }, probability }))
    }
    let ways = 1
    for (let k = 0; k <= lots; k++) {
      const value = score(k)
      const entry = out.get(value) || { probability: 0 }
      entry.probability += ways / 2 ** lots
      out.set(value, entry)
      ways = ways * (lots - k) / (k + 1)
    }
    return [...out].map(([value, { probability }]) => ({ move: { action: 'throw', value }, probability }))
  }

  // Which distances to the end some run of throws can cover exactly. With
  // six cowries nothing throws a 1, so a Pachisi piece one square from home
  // never gets there; the judgement below has to know that such a square is
  // no progress at all.
  let finishable = null
  function canFinishFrom(left) {
    if (config.bearOff === 'over') return true
    if (!finishable) {
      const values = [...new Set(throwOutcomes().flatMap(o => (o.move.dice || [o.move.value])))].filter(n => n > 0)
      const longest = Math.max(1, ...Object.values(routes).map(list => list.length)) + 1
      finishable = new Array(longest + 1).fill(false)
      finishable[0] = true
      for (let d = 1; d <= longest; d++) finishable[d] = values.some(n => n <= d && finishable[d - n])
    }
    return left < finishable.length ? finishable[left] : true
  }

  // How far a side still has to go: the steps left for each piece, and the
  // whole route plus one for each piece waiting to enter - or for a piece
  // standing where no throws can ever bring it home.
  function distance(slice, seat) {
    let left = 0
    for (const [route, n] of Object.entries(slice.reserve[seat] || {})) left += n * ((routes[route] || []).length + 1)
    for (const cell of Object.values(slice.board)) {
      if (!cell || cell.owner !== seat) continue
      for (const item of cell.items) {
        const path = routes[item.route] || []
        const gap = path.length - item.step
        left += canFinishFrom(gap) ? gap : path.length + 1
      }
    }
    return left
  }

  function evaluate(slice, seat) {
    if (slice.winner !== null && slice.winner !== undefined) {
      const mine = Array.isArray(config.teams) ? (config.teams.find(t => t.includes(seat)) || [seat]) : [seat]
      return mine.includes(slice.winner) ? 1e6 : -1e6
    }
    const partners = Array.isArray(config.teams) ? (config.teams.find(t => t.includes(seat)) || [seat]) : [seat]
    let value = 0
    for (let s = 0; s < seats; s++) value += (partners.includes(s) ? -1 : 1) * distance(slice, s)
    // A piece that cannot be landed on is worth something beyond its place.
    for (const [key, cell] of Object.entries(slice.board)) {
      if (!cell) continue
      if (!exposed(slice.board, cellKey(key), 1)) value += partners.includes(cell.owner) ? 2 : -2
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

  // What the position is worth once the next side has thrown and answered as
  // well as it can, over every throw.
  function replyValue(slice, seat) {
    let total = 0
    for (const { move, probability } of throwOutcomes()) {
      const next = playThrow(move, slice)
      const replies = next.phase === 'move' && next.toMove !== seat ? pieceMoves(next) : []
      let worst = evaluate(next, seat)
      for (const reply of replies) worst = Math.min(worst, evaluate(play(reply, next), seat))
      total += probability * worst
    }
    return total
  }

  function describeAction(move, prev, next) {
    if (move.action === 'throw') {
      const n = Array.isArray(next.lastThrow) ? next.lastThrow.join('-') : next.lastThrow
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
      return move.action === 'throw' ? throwOutcomes() : null
    },

    evaluate,
    policy,

    describeSeat(slice, seat) {
      if (!slice || !slice.reserve) return null
      const parts = []
      const waiting = reserveTotal(slice, seat)
      if (waiting) parts.push(`${waiting} to enter`)
      if (slice.off[seat]) parts.push(`${slice.off[seat]} off`)
      // A stack is drawn as one piece, so the count is said here.
      for (const [key, cell] of Object.entries(slice.board)) {
        if (cell && cell.owner === seat && cell.count > 1) parts.push(`${cell.count} on ${cellName(cellKey(key))}`)
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
