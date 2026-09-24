import { createRng } from '../../../../core/index.js'

// Press your luck: Farkle. "Roll all 6 dice. After the roll, you must set aside
// at least one scoring die or combination. If no dice score - you Farkle: lose
// all unbanked points for the turn. If dice score, choose: Bank ... or Roll
// again: roll remaining dice." All six set aside is hot dice, and all six roll
// again.
//
// What scores is data:
//
//     game: press-your-luck
//     dice: 6
//     singles: { 1: 100, 5: 50 }
//     triples: { 1: 1000, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600 }
//     multiples: { 4: 2, 5: 3, 6: 4 }     # n of a kind: this many times the triple
//     straight: 1500                     # one of each face
//     threePairs: 1500
//     opening: 500                       # to get on the board, in one turn
//     target: 10000
//     finalRound: true                   # everyone else has one more turn
//
// A move sets dice aside and says what next: `{ action: roll | bank, cards:
// [the dice set aside] }`. Every die set aside must score.

function settings(ctx) {
  const c = ctx.config
  return {
    dice: c.dice || 6,
    singles: c.singles || { 1: 100, 5: 50 },
    triples: c.triples || { 1: 1000, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600 },
    multiples: c.multiples || { 4: 2, 5: 3, 6: 4 },
    straight: c.straight ?? null,
    threePairs: c.threePairs ?? null,
    opening: c.opening || 0,
    target: c.target || 10000,
    finalRound: c.finalRound !== false,
  }
}

const idsOf = (dice) => dice.map((v, i) => (v === null ? null : `die${i}-${v}`)).filter(Boolean)
const valueOf = (id) => +String(id).split('-')[1]
const indexOf = (id) => +String(id).slice(3).split('-')[0]

// What a set of dice scores if every one of them scores, else null.
export function setScore(values, s) {
  if (!values.length) return null
  const c = new Map()
  for (const v of values) c.set(v, (c.get(v) || 0) + 1)
  if (s.straight && values.length === 6 && c.size === 6) return s.straight
  if (s.threePairs && values.length === 6 && c.size === 3 && [...c.values()].every(n => n === 2)) return s.threePairs
  let total = 0
  for (const [face, n] of c) {
    if (n >= 3) total += (s.triples[face] || 0) * (n === 3 ? 1 : (s.multiples[n] || 1))
    else if (s.singles[face]) total += s.singles[face] * n
    else return null
  }
  return total
}

function subsets(ids) {
  const out = []
  for (let mask = 1; mask < (1 << ids.length); mask++) out.push(ids.filter((_, i) => mask & (1 << i)))
  return out
}

function rollDice(slice, n) {
  // Each roll from its own generator, seeded from the game's seed and how
  // many rolls came before, so applying a move stays a pure function.
  const rng = createRng((slice.seed ^ Math.imul(slice.rollCount + 1, 0x9E3779B1)) >>> 0)
  return { values: Array.from({ length: n }, () => rng.nextInt(1, 6)), rollCount: slice.rollCount + 1 }
}

function endTurn(slice, seat, ctx, banked) {
  const s = settings(ctx)
  const scores = slice.scores.map((v, i) => (i === seat ? v + banked : v))
  const next = (seat + 1) % ctx.seats
  let lastRound = slice.lastRound
  if (lastRound === null && scores[seat] >= s.target) {
    if (!s.finalRound) return { ...slice, scores, finished: seat, next: null }
    lastRound = { trigger: seat }
  }
  const base = { ...slice, scores, dice: Array(s.dice).fill(null), aside: 0, turn: 0, lastRound, next }
  // The last of the final turns has been taken: the highest score wins.
  if (lastRound && next === lastRound.trigger) {
    const best = Math.max(...scores)
    const top = scores.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0)
    return { ...base, finished: top.length === 1 ? top[0] : 'draw', next: null }
  }
  return base
}

export const pressYourLuck = {
  init(base, ctx) {
    const s = settings(ctx)
    return { ...base, seed: ctx.seed || 1, rollCount: 0, dice: Array(s.dice).fill(null), aside: 0, turn: 0, scores: Array(ctx.seats).fill(0), lastRound: null, farkled: null, finished: null, next: null }
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.dice.every(v => v === null)) return [{ action: 'roll', cards: [] }]
    const live = idsOf(slice.dice)
    const out = []
    for (const set of subsets(live)) {
      const points = setScore(set.map(valueOf), s)
      if (points === null) continue
      const turn = slice.turn + points
      out.push({ action: 'roll', cards: set })
      // Not on the board until one turn makes the opening score.
      if (slice.scores[seat] > 0 || turn >= s.opening) out.push({ action: 'bank', cards: set })
    }
    return out.length ? out : [{ action: 'farkle' }]
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    if (move.action === 'farkle') return { ...endTurn(slice, seat, ctx, 0), farkled: seat }
    const fresh = slice.dice.every(v => v === null)
    const points = fresh ? 0 : setScore(move.cards.map(valueOf), s)
    const turn = slice.turn + points
    if (move.action === 'bank') return { ...endTurn(slice, seat, ctx, turn), farkled: null }
    // Roll the dice still in play; all six set aside is hot dice, and all roll.
    const setAside = new Set(move.cards.map(indexOf))
    const remaining = fresh ? s.dice : slice.dice.filter((v, i) => v !== null && !setAside.has(i)).length
    const n = remaining === 0 ? s.dice : remaining
    const { values, rollCount } = rollDice(slice, n)
    const dice = [...values, ...Array(s.dice - n).fill(null)]
    return { ...slice, dice, rollCount, turn, aside: s.dice - n, farkled: null, next: seat }
  },

  winner(slice) {
    return slice.finished
  },

  project(slice) {
    return { ...slice, seed: null }
  },

  table(view) {
    const live = idsOf(view.dice)
    if (!live.length) return []
    const label = `This turn ${view.turn} · ${view.aside} set aside · pick the dice that score, then roll or bank`
    return [{ label, cards: live, selectable: true }]
  },

  describeSeat(view, seat) {
    return `${view.scores[seat]}${view.lastRound ? ' · final round' : ''}`
  },

  // Take everything that scores; bank at 350 or more, or once few dice are
  // left, and always when banking wins.
  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    if (moves.length === 1) return moves[0]
    const score = (m) => setScore(m.cards.map(valueOf), s)
    const top = Math.max(...moves.map(score))
    const best = moves.filter(m => score(m) === top)
    const most = Math.max(...best.map(m => m.cards.length))
    const pick = best.filter(m => m.cards.length === most)
    const left = view.dice.filter(v => v !== null).length - most
    const turn = view.turn + top
    const bank = pick.find(m => m.action === 'bank')
    const reroll = pick.find(m => m.action === 'roll')
    if (bank && (view.scores[seat] + turn >= s.target || (left > 0 && (turn >= 350 && left <= 3)) || turn >= 1000)) return bank
    return reroll || bank
  },

  describe(move, ctx, after) {
    if (move.action === 'farkle') return 'farkle'
    const faces = move.cards.map(valueOf).join('')
    if (move.action === 'bank') return `${faces} bank`
    return after?.dice ? `${faces ? faces + ' ' : ''}roll ${after.dice.filter(v => v !== null).join('')}` : 'roll'
  },
}
