import { createRng } from '../../../../core/index.js'

// Scorecard dice: Yahtzee. "Roll all 5 dice. Optionally keep any dice and
// re-roll the rest (up to 2 more times). After the final roll, choose one
// unfilled category on your scorecard and record the score (which may be 0).
// Each category may only be filled once per game." Highest total wins.
//
// The categories are the game, and each is a rule over the dice:
//
//     game: scorecard
//     dice: 5
//     rolls: 3
//     categories:
//       aces: { count: 1 }                          # the sum of the dice showing 1
//       three-of-a-kind: { ofAKind: 3, score: total }
//       full-house: { pattern: [3, 2], score: 25 }
//       small-straight: { straight: 4, score: 30 }
//       yahtzee: { ofAKind: 5, score: 50 }
//       chance: { score: total }
//     bonuses:
//       - { categories: [aces, twos, threes, fours, fives, sixes], atLeast: 63, score: 35 }
//     repeat: { category: yahtzee, bonus: 100 }   # another after scoring it: bonus, and joker rules
//
// A roll is `{ action: roll, cards: [the dice kept] }`; the dice kept are
// picked first, as cards are. Scoring is `{ action: score, value: category }`.

function settings(ctx) {
  const c = ctx.config
  return {
    dice: c.dice || 5,
    rolls: c.rolls || 3,
    categories: c.categories || {},
    bonuses: c.bonuses || [],
    repeat: c.repeat || null,
  }
}

const idsOf = (dice) => dice.map((v, i) => `die${i}-${v}`)
const valueOf = (id) => +String(id).split('-')[1]
const indexOf = (id) => +String(id).slice(3).split('-')[0]

function roll(slice, keep, s) {
  // Each roll from its own generator, seeded from the game's seed and how
  // many rolls came before, so applying a move stays a pure function.
  const rng = createRng((slice.seed ^ Math.imul(slice.rollCount + 1, 0x9E3779B1)) >>> 0)
  const dice = Array.from({ length: s.dice }, (_, i) => (keep.includes(i) ? slice.dice[i] : rng.nextInt(1, 6)))
  return { dice, rollCount: slice.rollCount + 1 }
}

function counts(dice) {
  const c = new Map()
  for (const v of dice) c.set(v, (c.get(v) || 0) + 1)
  return c
}

function longestRun(dice) {
  const faces = [...new Set(dice)].sort((a, b) => a - b)
  let best = 0, run = 0
  faces.forEach((f, i) => { run = i && f === faces[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run) })
  return best
}

// What a category is worth for these dice. `joker` counts the dice as meeting
// any lower requirement.
export function categoryScore(rule, dice, joker = false) {
  const total = dice.reduce((n, v) => n + v, 0)
  const c = counts(dice)
  const worth = rule.score === 'total' || rule.score === undefined ? total : rule.score
  if (rule.count !== undefined) return dice.filter(v => v === rule.count).length * rule.count
  if (joker) return worth
  if (rule.ofAKind !== undefined) return Math.max(...c.values()) >= rule.ofAKind ? worth : 0
  if (rule.pattern) {
    const shape = [...c.values()].sort((a, b) => b - a)
    return rule.pattern.every((n, i) => shape[i] === n) && shape.length === rule.pattern.length ? worth : 0
  }
  if (rule.straight !== undefined) return longestRun(dice) >= rule.straight ? worth : 0
  return worth
}

function totalOf(card, s) {
  let total = Object.values(card).reduce((n, v) => n + (v || 0), 0)
  for (const b of s.bonuses) {
    const sub = b.categories.reduce((n, k) => n + (card[k] || 0), 0)
    if (sub >= b.atLeast) total += b.score
  }
  return total
}

// Which boxes may take these dice, and for what. A repeat of the bonus
// category, already scored, is a joker: the matching upper box if it is
// open, else any lower box at full value, else an upper box for nothing.
function options(slice, seat, s) {
  const card = slice.cards[seat]
  const open = Object.keys(s.categories).filter(k => card[k] === undefined)
  const dice = slice.dice
  const same = new Set(dice).size === 1
  const rep = s.repeat
  if (rep && same && card[rep.category] > 0) {
    const upper = open.find(k => s.categories[k].count === dice[0])
    if (upper) return [{ value: upper, points: categoryScore(s.categories[upper], dice) }]
    const lower = open.filter(k => s.categories[k].count === undefined)
    if (lower.length) return lower.map(k => ({ value: k, points: categoryScore(s.categories[k], dice, true) }))
    return open.map(k => ({ value: k, points: 0 }))
  }
  return open.map(k => ({ value: k, points: categoryScore(s.categories[k], dice) }))
}

export const scorecard = {
  init(base, ctx) {
    const s = settings(ctx)
    return {
      ...base,
      seed: ctx.seed || 1,
      rollCount: 0,
      dice: Array(s.dice).fill(null),
      rollsLeft: s.rolls,
      cards: Array.from({ length: ctx.seats }, () => ({})),
      bonus: Array(ctx.seats).fill(0),
      finished: null,
      next: null,
    }
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.rollsLeft === s.rolls) return [{ action: 'roll', cards: [] }]
    const moves = options(slice, seat, s).map(o => ({ action: 'score', ...o }))
    if (slice.rollsLeft > 0) {
      // Every set of dice that could be kept, the empty set included.
      const ids = idsOf(slice.dice)
      for (let mask = 0; mask < (1 << ids.length) - 1; mask++) {
        moves.push({ action: 'roll', cards: ids.filter((_, i) => mask & (1 << i)) })
      }
    }
    return moves
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    if (move.action === 'roll') {
      const keep = move.cards.map(indexOf)
      return { ...slice, ...roll(slice, keep, s), rollsLeft: slice.rollsLeft - 1, next: seat }
    }
    const rep = s.repeat
    const same = slice.dice.every(v => v === slice.dice[0])
    const bonus = slice.bonus.map((b, i) => (i === seat && rep && same && slice.cards[seat][rep.category] > 0 ? b + rep.bonus : b))
    const points = options(slice, seat, s).find(o => o.value === move.value).points
    const cards = slice.cards.map((c, i) => (i === seat ? { ...c, [move.value]: points } : c))
    const after = { ...slice, cards, bonus, dice: Array(s.dice).fill(null), rollsLeft: s.rolls, next: (seat + 1) % ctx.seats }
    const boxes = Object.keys(s.categories).length
    if (cards.every(c => Object.keys(c).length === boxes)) {
      const totals = cards.map((c, i) => totalOf(c, s) + bonus[i])
      const best = Math.max(...totals)
      const top = totals.map((t, i) => (t === best ? i : -1)).filter(i => i >= 0)
      return { ...after, totals, finished: top.length === 1 ? top[0] : 'draw', next: null }
    }
    return after
  },

  winner(slice) {
    return slice.finished
  },

  // The dice are on the table for everyone; what comes next is not.
  project(slice) {
    return { ...slice, seed: null }
  },

  table(view, ctx) {
    if (view.dice[0] === null) return []
    const s = settings(ctx)
    const rolled = s.rolls - view.rollsLeft
    return [{ label: `Roll ${rolled} of ${s.rolls}${view.rollsLeft ? ' · pick the dice to keep, then roll' : ''}`, cards: idsOf(view.dice), selectable: view.rollsLeft > 0 }]
  },

  describeSeat(view, seat, ctx) {
    const s = settings(ctx)
    const card = view.cards[seat]
    const filled = Object.keys(card).length
    return `${totalOf(card, s) + view.bonus[seat]} · ${filled}/${Object.keys(s.categories).length} boxes`
  },

  // Keep the most common face, or the run, and score where the dice are worth
  // most above what that box usually brings.
  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    const rolls = moves.filter(m => m.action === 'roll')
    const scores = moves.filter(m => m.action === 'score')
    if (!scores.length) return rolls[0]
    const par = (k) => {
      const r = s.categories[k]
      if (r.count !== undefined) return r.count * 3
      if (r.ofAKind === 5) return 15
      if (r.score === 'total' || r.score === undefined) return 22
      return (r.score || 0) * 0.5
    }
    const best = scores.reduce((a, m) => (m.points - par(m.value) > a.points - par(a.value) ? m : a))
    if (!rolls.length || best.points - par(best.value) >= 10) return best
    const dice = view.dice
    const c = counts(dice)
    const [face, n] = [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
    let keep
    if (n < 3 && longestRun(dice) >= 3) {
      const seen = new Set()
      keep = idsOf(dice).filter(id => { const v = valueOf(id); if (seen.has(v)) return false; seen.add(v); return true })
      const run = [...seen].sort((a, b) => a - b)
      keep = keep.filter(id => run.some(v => v === valueOf(id) && (run.includes(v + 1) || run.includes(v - 1))))
    } else {
      keep = idsOf(dice).filter(id => valueOf(id) === face)
    }
    const want = keep.slice().sort().join(',')
    return rolls.find(m => m.cards.slice().sort().join(',') === want) || best
  },

  describe(move, ctx, after) {
    if (move.action === 'roll') return after?.dice ? `roll ${after.dice.join('')}` : 'roll'
    return `${move.value} ${move.points}`
  },
}
