import { createRng } from '../../../../core/index.js'
import { chipSettings, richest } from './chips.js'

// Shooting: Craps (engine#184), from its page, for play chips. One player is
// the shooter; everyone bets the Pass Line or Don't Pass before the come-out.
//
//   come-out   "7 or 11 (natural)": pass wins; "2 or 3 (craps)": don't pass
//              wins; "12": pass loses and don't pass pushes; any other total
//              becomes the Point.
//   the point  "Point number again": pass wins; "7 (Seven-Out)": don't pass
//              wins and the dice pass on; anything else rolls again.
//
// Once a point is set, a Pass bettor may take Odds, paid at true odds: 2:1 on
// 4 or 10, 3:2 on 5 or 9, 6:5 on 6 or 8. Every bet pays even money otherwise.
//
//     game: shooting
//     chips: { start: 100, bets: [1, 2, 5, 10, 25] }
//     shooters: 2            # each player shoots this many times

const TRUE_ODDS = { 4: 2, 10: 2, 5: 1.5, 9: 1.5, 6: 1.2, 8: 1.2 }

const seatsOf = (slice) => slice.stacks.map((_, i) => i)

function comeOut(slice, ctx) {
  const shooters = Number(ctx.config.shooters ?? 2) || 2
  const betting = seatsOf(slice).filter(i => slice.stacks[i] > 0)
  if (!betting.length || slice.turns.every(n => n >= shooters)) {
    return { ...slice, phase: 'over', finished: richest(slice.stacks, seatsOf(slice)), next: null }
  }
  return { ...slice, phase: 'bet', point: null, line: slice.stacks.map(() => null), odds: slice.stacks.map(() => 0), asked: betting, next: betting[0] }
}

function settle(slice, passWins, dontResult) {
  const stacks = [...slice.stacks]
  slice.line.forEach((bet, seat) => {
    if (!bet) return
    if (bet.type === 'pass' && passWins) stacks[seat] += bet.amount * 2 + slice.odds[seat] * (1 + (TRUE_ODDS[slice.point] || 0))
    if (bet.type === 'dont' && dontResult === 'win') stacks[seat] += bet.amount * 2
    if (bet.type === 'dont' && dontResult === 'push') stacks[seat] += bet.amount
  })
  return stacks
}

// What a roll of these two dice does.
export function resolveRoll(slice, seat, dice, ctx) {
  const sum = dice[0] + dice[1]
  const lastRoll = { seat, dice: dice.map((f, k) => `die${k}-${f}`), sum }
  const next = { ...slice, rolls: slice.rolls + 1, lastRoll }
  if (slice.point === null) {
    if (sum === 7 || sum === 11) return comeOut({ ...next, stacks: settle(next, true, 'lose'), lastDecision: 'natural: pass wins' }, ctx)
    if (sum === 2 || sum === 3) return comeOut({ ...next, stacks: settle(next, false, 'win'), lastDecision: 'craps: don\'t pass wins' }, ctx)
    if (sum === 12) return comeOut({ ...next, stacks: settle(next, false, 'push'), lastDecision: 'craps twelve: pass loses, don\'t pass pushes' }, ctx)
    // A point: pass bettors may now take odds.
    const takers = seatsOf(next).filter(i => next.line[i] && next.line[i].type === 'pass' && next.stacks[i] > 0)
    const pointed = { ...next, point: sum }
    return takers.length ? { ...pointed, phase: 'odds', asked: takers, next: takers[0] } : { ...pointed, next: slice.shooter }
  }
  if (sum === slice.point) return comeOut({ ...next, stacks: settle(next, true, 'lose'), lastDecision: `made the point ${sum}: pass wins` }, ctx)
  if (sum === 7) {
    const turns = slice.turns.map((n, i) => (i === slice.shooter ? n + 1 : n))
    let shooter = slice.shooter
    for (let k = 1; k <= slice.stacks.length; k++) {
      const s = (slice.shooter + k) % slice.stacks.length
      if (slice.stacks[s] > 0 || k === slice.stacks.length) { shooter = s; break }
    }
    return comeOut({ ...next, turns, shooter, stacks: settle(next, false, 'win'), lastDecision: 'seven-out: don\'t pass wins, the dice pass on' }, ctx)
  }
  return { ...next, next: slice.shooter }
}

export const shooting = {
  init(base, ctx) {
    const { start } = chipSettings(ctx)
    return comeOut({ seed: ctx.seed || 1, rolls: 0, stacks: Array(ctx.seats).fill(start), turns: Array(ctx.seats).fill(0), shooter: 0, hands: Array.from({ length: ctx.seats }, () => []), community: [], drawPile: [], finished: null }, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const stack = slice.stacks[seat]
    if (slice.phase === 'bet') {
      const bets = chipSettings(ctx).bets.filter(b => b <= stack)
      return [...bets.map(b => ({ action: 'bet', value: `pass ${b}` })), ...bets.map(b => ({ action: 'bet', value: `don't ${b}` })), { action: 'skip' }]
    }
    if (slice.phase === 'odds') {
      const line = slice.line[seat]
      const most = Math.min(line.amount, stack)
      return [...chipSettings(ctx).bets.filter(b => b <= most).map(b => ({ action: 'odds', value: String(b) })), { action: 'skip' }]
    }
    return [{ action: 'roll' }]
  },

  apply(move, slice, seat, ctx) {
    if (slice.phase === 'bet' || slice.phase === 'odds') {
      let next = slice
      if (move.action === 'bet') {
        const [kind, amount] = String(move.value).split(' ')
        next = { ...slice, line: slice.line.map((b, i) => (i === seat ? { type: kind === 'pass' ? 'pass' : 'dont', amount: Number(amount) } : b)), stacks: slice.stacks.map((v, i) => (i === seat ? v - Number(amount) : v)) }
      } else if (move.action === 'odds') {
        next = { ...slice, odds: slice.odds.map((v, i) => (i === seat ? Number(move.value) : v)), stacks: slice.stacks.map((v, i) => (i === seat ? v - Number(move.value) : v)) }
      }
      const rest = slice.asked.slice(slice.asked.indexOf(seat) + 1)
      return rest.length ? { ...next, next: rest[0] } : { ...next, phase: 'roll', next: slice.shooter }
    }

    const rng = createRng((slice.seed ^ Math.imul(slice.rolls + 1, 0x9E3779B1)) >>> 0)
    return resolveRoll(slice, seat, [rng.nextInt(1, 6), rng.nextInt(1, 6)], ctx)
  },

  winner(slice) {
    return slice.finished
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const bets = view.line.map((b, i) => (b ? `${name(i)} ${b.type === 'pass' ? 'pass' : "don't pass"} ${b.amount}${view.odds[i] ? ` + odds ${view.odds[i]}` : ''}` : null)).filter(Boolean)
    const groups = [{ label: `${name(view.shooter)} shoots · ${view.point === null ? 'come-out' : `point ${view.point}`}${bets.length ? ` · ${bets.join(', ')}` : ''}`, cards: [] }]
    if (view.lastRoll) groups.push({ label: `${name(view.lastRoll.seat)} rolled ${view.lastRoll.sum}${view.lastDecision && view.point === null ? ` · ${view.lastDecision}` : ''}`, cards: view.lastRoll.dice })
    return groups
  },

  describeSeat(view, seat, ctx) {
    const shooters = Number(ctx.config.shooters ?? 2) || 2
    return `${view.stacks[seat]} chips · shot ${view.turns[seat]} of ${shooters}${seat === view.shooter ? ' · shooter' : ''}`
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return 'A tie on chips'
    return `${shown[slice.finished]} finishes with the most chips, ${slice.stacks[slice.finished]}`
  },

  // The page's rule of thumb: "stick to Pass/Don't Pass with max Odds". Which
  // of the two is a coin toss from the seeded random source.
  policy(view, seat, moves, ctx, random) {
    if (view.phase === 'bet') {
      const side = random && random() < 0.5 ? "don't" : 'pass'
      return moves.find(m => m.action === 'bet' && m.value.startsWith(side)) || moves[moves.length - 1]
    }
    if (view.phase === 'odds') return moves.filter(m => m.action === 'odds').pop() || moves[moves.length - 1]
    return moves[0]
  },

  describe(move) {
    return move.value ? `${move.action} ${move.value}` : move.action
  },
}
