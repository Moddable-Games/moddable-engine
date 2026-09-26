import { createRng } from '../../../../core/index.js'

// Pegging: Cribbage for two, three or four (engine#184). Each hand has
// three parts, as the page gives them:
//
//   - the crib: each player discards to a second hand that belongs to the
//     dealer (in three-player, "one additional card is dealt from the top of
//     the deck directly to the crib"); then a starter is turned, and a Jack
//     pegs the dealer "Two for his heels";
//   - pegging: from the dealer's left, cards are played one at a time and the
//     running total called, never past 31. Fifteen and thirty-one score 2,
//     pairs 2, 6 and 12, runs their length, and the last player to play in a
//     count pegs 1 for the go, or for the last card;
//   - the show: each hand with the starter, from the dealer's left, the
//     dealer last and then the crib - fifteens, pairs, runs, flush and nobs.
//
// "The game ends immediately when any player's front peg reaches or passes
// hole 121."
//
//     game: pegging
//     cardsEach: 6
//     toCrib: 2
//     cribFromDeck: 0
//     partnerships: [[player1, player3], [player2, player4]]   # four-player
//     target: 121

const RANK = { A: 1, J: 11, Q: 12, K: 13 }
const rankOf = (card) => RANK[card.rank] ?? Number(card.rank)
const valueOf = (card) => Math.min(10, rankOf(card))

function settings(ctx) {
  const c = ctx.config
  const names = ctx.names
  const seatOf = (n) => (typeof n === 'number' ? n : names.indexOf(n))
  const teams = (c.partnerships || []).map(t => t.map(seatOf))
  return {
    each: Number(c.cardsEach ?? 6),
    toCrib: Number(c.toCrib ?? 2),
    fromDeck: Number(c.cribFromDeck ?? 0),
    target: Number(c.target ?? 121),
    teams,
    sideOf: (seat) => { const i = teams.findIndex(t => t.includes(seat)); return i >= 0 ? i : seat },
    sides: teams.length || ctx.seats,
  }
}

function choose(list, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) { out.push(prefix); return out }
  for (let i = start; i <= list.length - (k - prefix.length); i++) choose(list, k, i + 1, [...prefix, list[i]], out)
  return out
}

// A hand's show: four cards and the starter.
export function showScore(hand, starter, ctx, isCrib = false) {
  const cards = [...hand, starter].map(id => ctx.card(id))
  let score = 0
  // Fifteens: every combination of cards that adds to fifteen.
  for (let k = 2; k <= 5; k++) for (const group of choose(cards, k)) if (group.reduce((n, c) => n + valueOf(c), 0) === 15) score += 2
  // Pairs: two for every pair.
  for (const [a, b] of choose(cards, 2)) if (a.rank === b.rank) score += 2
  // Runs: the longest runs, each counted once for every way of making it.
  const counts = new Map()
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) || 0) + 1)
  const ranks = [...counts.keys()].sort((a, b) => a - b)
  let i = 0
  while (i < ranks.length) {
    let j = i
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j++
    const length = j - i + 1
    if (length >= 3) score += length * ranks.slice(i, j + 1).reduce((n, r) => n * counts.get(r), 1)
    i = j + 1
  }
  // Flush: four in the hand, or five with the starter; a crib needs all five.
  const suits = hand.map(id => ctx.card(id).suit)
  if (suits.every(s => s === suits[0])) {
    if (ctx.card(starter).suit === suits[0]) score += 5
    else if (!isCrib) score += 4
  }
  // Nobs: the Jack of the starter's suit in hand.
  if (hand.some(id => ctx.card(id).rank === 'J' && ctx.card(id).suit === ctx.card(starter).suit)) score += 1
  return score
}

// What a card scores as it is played onto the count.
function pegScore(sequence, ctx) {
  const cards = sequence.map(id => ctx.card(id))
  const count = cards.reduce((n, c) => n + valueOf(c), 0)
  let score = count === 15 || count === 31 ? 2 : 0
  const last = cards[cards.length - 1]
  let same = 1
  for (let k = cards.length - 2; k >= 0 && cards[k].rank === last.rank; k--) same++
  score += { 2: 2, 3: 6, 4: 12 }[same] || 0
  for (let k = cards.length; k >= 3; k--) {
    const tail = cards.slice(-k).map(rankOf).sort((a, b) => a - b)
    if (tail.every((r, i) => i === 0 || r === tail[i - 1] + 1)) { score += k; break }
  }
  return score
}

function addScore(slice, seat, points, ctx) {
  if (!points || slice.finished !== null) return slice
  const s = settings(ctx)
  const side = s.sideOf(seat)
  const scores = slice.scores.map((v, i) => (i === side ? v + points : v))
  const won = scores[side] >= s.target
  return { ...slice, scores, finished: won ? seat : null, phase: won ? 'over' : slice.phase, next: won ? null : slice.next }
}

function deal(slice, handNo, ctx) {
  const s = settings(ctx)
  const seats = ctx.seats
  const dealer = handNo % seats
  const pool = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const hands = Array.from({ length: seats }, () => [])
  for (let k = 0; k < s.each; k++) for (let p = 1; p <= seats; p++) hands[(dealer + p) % seats].push(pool.shift())
  const crib = pool.splice(0, s.fromDeck)
  return {
    ...slice,
    hand: handNo,
    dealer,
    hands,
    drawPile: pool,
    crib,
    kept: Array(seats).fill(null),
    starter: null,
    phase: 'discard',
    count: 0,
    sequence: [],
    pegged: [],
    passed: [],
    lastPlayer: null,
    next: (dealer + 1) % seats,
  }
}

function nextWithCards(slice, from, ctx, skip = []) {
  for (let k = 1; k <= ctx.seats; k++) {
    const seat = (from + k) % ctx.seats
    if (slice.hands[seat].length && !skip.includes(seat)) return seat
  }
  return null
}

// The count is over: the last player pegs for the go unless they made 31,
// and the next count is led by the player after them.
function closeCount(slice, ctx) {
  let next = slice.count === 31 ? slice : addScore(slice, slice.lastPlayer, 1, ctx)
  if (next.finished !== null) return next
  next = { ...next, count: 0, sequence: [], passed: [] }
  if (next.hands.every(h => !h.length)) return show(next, ctx)
  return { ...next, next: nextWithCards(next, next.lastPlayer, ctx) }
}

// Every hand counted with the starter, from the dealer's left, then the crib.
function show(slice, ctx) {
  const seats = ctx.seats
  let next = { ...slice, phase: 'show' }
  const shown = []
  for (let k = 1; k <= seats; k++) {
    const seat = (slice.dealer + k) % seats
    const points = showScore(slice.kept[seat], slice.starter, ctx)
    shown.push({ seat, points })
    next = addScore(next, seat, points, ctx)
    if (next.finished !== null) return { ...next, lastShow: shown }
  }
  const cribPoints = showScore(slice.crib, slice.starter, ctx, true)
  shown.push({ seat: slice.dealer, points: cribPoints, crib: true })
  next = addScore(next, slice.dealer, cribPoints, ctx)
  if (next.finished !== null) return { ...next, lastShow: shown }
  return deal({ ...next, lastShow: shown, lastStarter: slice.starter, lastCrib: slice.crib }, slice.hand + 1, ctx)
}

export const pegging = {
  init(base, ctx) {
    return deal({ seed: ctx.seed || 1, scores: Array(settings(ctx).sides).fill(0), finished: null, next: null }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.phase === 'discard') return choose(slice.hands[seat], s.toCrib).map(cards => ({ action: 'discard', cards }))
    if (slice.phase !== 'peg') return []
    const plays = slice.hands[seat].filter(id => slice.count + valueOf(ctx.card(id)) <= 31).map(id => ({ action: 'play', cards: [id] }))
    return plays.length ? plays : [{ action: 'go' }]
  },

  apply(move, slice, seat, ctx) {
    const seats = ctx.seats
    if (move.action === 'discard') {
      const hands = slice.hands.map((h, i) => (i === seat ? h.filter(id => !move.cards.includes(id)) : h))
      const kept = slice.kept.map((k, i) => (i === seat ? hands[seat] : k))
      const crib = [...slice.crib, ...move.cards]
      const done = kept.every(k => k !== null)
      if (!done) return { ...slice, hands, kept, crib, next: (seat + 1) % seats }
      // The starter; a Jack is two for his heels to the dealer.
      const [starter, ...rest] = slice.drawPile
      let next = { ...slice, hands, kept, crib, starter, drawPile: rest, phase: 'peg', next: (slice.dealer + 1) % seats }
      if (ctx.card(starter).rank === 'J') next = addScore(next, slice.dealer, 2, ctx)
      return next
    }
    if (move.action === 'go') {
      const passed = [...slice.passed, seat]
      const after = { ...slice, passed }
      // The others go on until nobody can; a player who cannot says go in turn.
      const others = nextWithCards(after, seat, ctx, passed)
      return others === null ? closeCount(after, ctx) : { ...after, next: others }
    }
    const id = move.cards[0]
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(c => c !== id) : h))
    const sequence = [...slice.sequence, id]
    let next = { ...slice, hands, sequence, pegged: [...slice.pegged, id], count: slice.count + valueOf(ctx.card(id)), lastPlayer: seat }
    next = addScore(next, seat, pegScore(sequence, ctx), ctx)
    if (next.finished !== null) return next
    if (next.count === 31 || hands.every(h => !h.length)) return closeCount(next, ctx)
    const following = nextWithCards(next, seat, ctx, next.passed)
    if (following === null) return closeCount(next, ctx)
    return { ...next, next: following }
  },

  winner(slice) {
    return slice.finished
  },

  project(slice, seat) {
    return {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))),
      kept: slice.kept.map((k, i) => (i === seat || slice.phase === 'show' ? k : k && k.map(() => null))),
      crib: slice.crib.map(() => null),
      drawPile: slice.drawPile.map(() => null),
    }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    if (view.starter) groups.push({ label: `Starter · ${name(view.dealer)}'s crib`, cards: [view.starter], layout: 'pile' })
    if (view.phase === 'peg') groups.push({ label: `Count ${view.count}${view.passed.length ? ` · go from ${view.passed.map(name).join(', ')}` : ''}`, cards: view.sequence })
    if (view.phase === 'discard') groups.push({ label: `Discard to ${name(view.dealer)}'s crib`, cards: [] })
    if (view.lastShow && view.phase !== 'peg') {
      groups.push({ label: `Last show: ${view.lastShow.map(x => `${x.crib ? 'crib' : name(x.seat)} ${x.points}`).join(' · ')}`, cards: view.lastStarter ? [view.lastStarter] : [] })
    }
    return groups
  },

  describeSeat(view, seat, ctx) {
    const s = settings(ctx)
    const parts = [`${view.scores[s.sideOf(seat)]} of ${s.target}`]
    if (seat === view.dealer) parts.push('dealer')
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const s = settings(ctx)
    const shown = ctx.displayNames || ctx.names
    const side = s.sideOf(slice.finished)
    const who = s.teams.length ? s.teams[side].map(i => shown[i]).join(' & ') : shown[slice.finished]
    return `${who} ${s.teams.length ? 'reach' : 'reaches'} ${s.target}, ${slice.scores.join('–')}`
  },

  // Keep the four cards that show best (the dealer counting what goes to
  // their own crib, the others against it); in pegging, take what scores and
  // never leave the count on 5 or 21.
  policy(view, seat, moves, ctx) {
    if (view.phase === 'discard') {
      const own = seat === view.dealer ? 1 : -1
      const worth = (m) => {
        const kept = view.hands[seat].filter(id => !m.cards.includes(id))
        // The kept cards shown as if the last were the starter: a fair guess at their worth.
        const keep = showScore(kept.slice(0, -1), kept[kept.length - 1], ctx)
        const given = m.cards.length >= 2 && ctx.card(m.cards[0]).rank === ctx.card(m.cards[1]).rank ? 2 : 0
        return keep + own * given + own * m.cards.reduce((n, id) => n + (valueOf(ctx.card(id)) === 5 ? 2 : 0), 0)
      }
      return moves.reduce((a, b) => (worth(b) > worth(a) ? b : a))
    }
    const plays = moves.filter(m => m.action === 'play')
    if (!plays.length) return moves[0]
    const gain = (m) => pegScore([...view.sequence, m.cards[0]], ctx) * 10 - ([5, 21].includes(view.count + valueOf(ctx.card(m.cards[0]))) ? 5 : 0) + valueOf(ctx.card(m.cards[0])) / 10
    return plays.reduce((a, b) => (gain(b) > gain(a) ? b : a))
  },

  describe(move, ctx) {
    if (move.action === 'discard') return `discards ${move.cards.length}`
    if (move.action === 'go') return 'go'
    return move.cards.map(id => ctx.card(id)?.display || id).join(' ')
  },
}
