import { createRng } from '../../../../core/index.js'

// Rolling rounds: Bunco (engine#184). Players sit four to a table, partners
// opposite. In each of six rounds the target is the round number: a roll of
// three dice scores 1 for each die showing it, three of a kind of another
// number scores 5 (Wikipedia), and three of the target is a Bunco, worth 21. A
// player who scores rolls again; one who does not passes the dice on. The
// round ends when a team at the head table reaches 21, and every table's
// higher team wins it there. Winners move up a table and losers down, the
// head table's winners staying. After six rounds the player with most round
// wins takes the game, points breaking a tie.
//
// The tables roll in turn, one roll at each, so that play at every table goes
// on while the head table plays.
//
//     game: rolling-rounds
//     dice: 3
//     rounds: 6
//     bunco: 21
//     threeOfAKind: 5
//     roundEnds: 21

function settings(ctx) {
  const c = ctx.config
  return {
    dice: Number(c.dice ?? 3),
    rounds: Number(c.rounds ?? 6),
    bunco: Number(c.bunco ?? 21),
    triple: Number(c.threeOfAKind ?? 5),
    ends: Number(c.roundEnds ?? 21),
  }
}

// Teams at a table: the seats at positions 0 and 2, and 1 and 3.
const teamsAt = (seats) => [[seats[0], seats[2]], [seats[1], seats[3]]]

// Partners sit opposite at the first table and move together after.
const partnerOf = (seat) => (seat % 4 < 2 ? seat + 2 : seat - 2)

function freshRound(slice, round) {
  return {
    ...slice,
    round,
    points: slice.tables.map(() => [0, 0]),
    roller: slice.tables.map(() => 0),
    active: 0,
    lastRolls: slice.tables.map(() => null),
    next: slice.tables[0][0],
  }
}

export function scoreRoll(faces, target, s) {
  if (faces.every(f => f === target)) return { points: s.bunco, bunco: true }
  const hits = faces.filter(f => f === target).length
  if (hits) return { points: hits, bunco: false }
  if (faces.every(f => f === faces[0])) return { points: s.triple, bunco: false }
  return { points: 0, bunco: false }
}

// The round is over: record each table's result and move the teams.
function endRound(slice, ctx) {
  const s = settings(ctx)
  const wins = [...slice.wins], losses = [...slice.losses]
  const outcome = slice.tables.map((seats, t) => {
    const [a, b] = slice.points[t]
    const teams = teamsAt(seats)
    if (a === b) return { winner: teams[0], loser: teams[1], tie: true }
    return a > b ? { winner: teams[0], loser: teams[1] } : { winner: teams[1], loser: teams[0] }
  })
  outcome.forEach(o => {
    if (o.tie) return
    for (const seat of o.winner) wins[seat]++
    for (const seat of o.loser) losses[seat]++
  })
  const totals = slice.totals.map((v, seat) => {
    const t = slice.tables.findIndex(ts => ts.includes(seat))
    const side = teamsAt(slice.tables[t])[0].includes(seat) ? 0 : 1
    return v + slice.points[t][side]
  })
  // Table 0 is the head. Its winners stay; every other table's winners move
  // up one; every table's losers move down one, the last table's staying.
  const last = slice.tables.length - 1
  const arriving = slice.tables.map(() => [])
  outcome.forEach((o, t) => {
    arriving[t === 0 ? 0 : t - 1].push(o.winner)
    arriving[t === last ? last : t + 1].push(o.loser)
  })
  const tables = arriving.map(([p, q]) => [p[0], q[0], p[1], q[1]])
  const next = { ...slice, wins, losses, totals, tables, lastRound: outcome.map(o => ({ winner: o.winner, tie: !!o.tie })) }
  if (slice.round >= s.rounds) {
    // Partners move and score together, so the game is won by a pair.
    const score = (seat) => wins[seat] * 10000 + totals[seat]
    const best = Math.max(...wins.map((_, seat) => score(seat)))
    const leaders = wins.map((_, seat) => seat).filter(seat => score(seat) === best)
    const onePair = leaders.every(seat => leaders.includes(partnerOf(seat)))
    return { ...next, finished: onePair && leaders.length === 2 ? leaders[0] : 'draw', next: null }
  }
  return freshRound(next, slice.round + 1)
}

export const rollingRounds = {
  init(base, ctx) {
    const seats = ctx.seats - (ctx.seats % 4)
    const tables = []
    for (let t = 0; t < seats / 4; t++) tables.push([4 * t, 4 * t + 1, 4 * t + 2, 4 * t + 3])
    const zero = Array(ctx.seats).fill(0)
    return freshRound({ seed: ctx.seed || 1, rolls: 0, tables, wins: [...zero], losses: [...zero], buncos: [...zero], totals: [...zero], hands: Array.from({ length: ctx.seats }, () => []), community: [], drawPile: [], finished: null }, 1)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves() {
    return [{ action: 'roll' }]
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    const t = slice.active
    const rng = createRng((slice.seed ^ Math.imul(slice.rolls + 1, 0x9E3779B1)) >>> 0)
    const faces = Array.from({ length: s.dice }, () => rng.nextInt(1, 6))
    const { points, bunco } = scoreRoll(faces, slice.round, s)
    const side = teamsAt(slice.tables[t])[0].includes(seat) ? 0 : 1
    const tablePoints = slice.points.map((p, i) => (i === t ? p.map((v, k) => (k === side ? v + points : v)) : p))
    const roller = slice.roller.map((r, i) => (i === t && !points ? (r + 1) % 4 : r))
    const dice = faces.map((f, k) => `die${k}-${f}`)
    let next = {
      ...slice,
      rolls: slice.rolls + 1,
      points: tablePoints,
      roller,
      buncos: slice.buncos.map((n, i) => (i === seat && bunco ? n + 1 : n)),
      lastRolls: slice.lastRolls.map((r, i) => (i === t ? { seat, dice, points, bunco } : r)),
    }
    if (t === 0 && tablePoints[0].some(v => v >= s.ends)) return endRound(next, ctx)
    const active = (t + 1) % slice.tables.length
    next = { ...next, active, next: next.tables[active][next.roller[active]] }
    return next
  },

  winner(slice) {
    return slice.finished
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    return view.tables.map((seats, t) => {
      const teams = teamsAt(seats)
      const last = view.lastRolls[t]
      const label = `${t === 0 ? 'Head table' : `Table ${t + 1}`} · round ${view.round}, rolling for ${view.round}s · ${teams[0].map(name).join(' & ')} ${view.points[t][0]} – ${view.points[t][1]} ${teams[1].map(name).join(' & ')}${last ? ` · ${name(last.seat)} ${last.bunco ? 'BUNCO!' : `+${last.points}`}` : ''}`
      return { label, cards: last ? last.dice : [] }
    })
  },

  describeSeat(view, seat) {
    return `${view.wins[seat]} won · ${view.losses[seat]} lost · ${view.buncos[seat]} bunco${view.buncos[seat] === 1 ? '' : 's'}`
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return 'A tie on round wins and points'
    return `${shown[slice.finished]} & ${shown[partnerOf(slice.finished)]} win with ${slice.wins[slice.finished]} rounds won`
  },

  policy(view, seat, moves) {
    return moves[0]
  },

  describe(move) {
    return move.action
  },
}
