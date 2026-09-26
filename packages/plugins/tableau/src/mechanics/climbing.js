import { deal } from '../../../../component-deck/index.js'
import { createRng } from '../../../../core/index.js'
import { ordering, cardIdOf } from '../cards.js'

// Climbing: Big 2 and President. "Lead player plays any valid combination.
// Each subsequent player must play the same combination type at a higher
// value, or pass. When all other players pass, the last player who played
// leads the next trick." A pass is not permanent. The first player to empty
// their hand wins.
//
// Everything that varies is frontmatter:
//
//     game: climbing
//     rankOrder: [3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2]     # low to high
//     suitOrder: [diamonds, clubs, hearts, spades]           # low to high
//     combinations: [single, pair, triple, five-card]
//     fiveCardHands: [straight, flush, full-house, four-of-a-kind, straight-flush]
//     firstLead: 3-diamonds          # whoever holds it leads the first trick
//
// A single is worth its rank, then its suit. A pair is worth its rank, then
// its higher suit; a triple its rank. A five-card hand is worth its kind
// first, in the order `fiveCardHands` lists them, and then its deciding card:
// the highest card of a straight or a flush, the triple of a full house, the
// four of a four of a kind.
//
// A sequence is cards of consecutive ranks in the game's order, one of each,
// any suits, at least `sequence.min` long. It beats a sequence of the same
// length with a higher top card.
//
// President plays on past the first player out (`playTo: finishing-order`):
//
//     playTo: finishing-order     # a round ends when one player still holds cards
//     roles:                      # a finishing place, from the end when negative
//       - { place: 1, title: President }
//       - { place: -1, title: Scum }
//     exchange:                   # before the next round
//       - { from: -1, to: 1, count: 2 }   # gives its best; `to` returns as many of its choice
//     laterLead: -1               # who leads every round after the first
//     rounds: open                # or a number: the most first places after it wins
//
// A player who goes out takes no further part in the round. A trick ends when
// every player still in it has passed, and is led by whoever took it, or by
// the next player still in if they have gone out.

const SIZES = { single: 1, pair: 2, triple: 3, 'five-card': 5 }

function combos(ids, ctx, allowed, fiveKinds) {
  const { rankOf, suitOf, valueOf } = ordering(ctx.config)
  const cards = ids.map(id => ({ id, ...ctx.card(id) }))
  const out = []

  const byRank = new Map()
  for (const c of cards) {
    const r = rankOf(c)
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r).push(c)
  }

  if (allowed.includes('single')) {
    for (const c of cards) out.push({ cards: [c.id], kind: 'single', key: [valueOf(c)] })
  }
  for (const [r, group] of byRank) {
    if (allowed.includes('pair')) {
      for (const pair of choose(group, 2)) {
        out.push({ cards: pair.map(c => c.id), kind: 'pair', key: [r, Math.max(...pair.map(suitOf))] })
      }
    }
    if (allowed.includes('triple')) {
      for (const three of choose(group, 3)) out.push({ cards: three.map(c => c.id), kind: 'triple', key: [r] })
    }
  }
  if (allowed.includes('sequence')) {
    const min = Math.max(2, ctx.config.sequence?.min ?? 3)
    const ranks = [...byRank.keys()].filter(r => r >= 0).sort((a, b) => a - b)
    for (let i = 0; i < ranks.length; i++) {
      for (let j = i; j < ranks.length && ranks[j] === ranks[i] + (j - i); j++) {
        if (j - i + 1 < min) continue
        for (const pick of oneOfEach(ranks.slice(i, j + 1).map(r => byRank.get(r)))) {
          out.push({ cards: pick.map(c => c.id), kind: 'sequence', key: [ranks[j]] })
        }
      }
    }
  }
  if (allowed.includes('five-card') && cards.length >= 5) {
    for (const five of choose(cards, 5)) {
      const hand = classifyFive(five, rankOf, suitOf, valueOf)
      if (!hand) continue
      const tier = fiveKinds.indexOf(hand.kind)
      if (tier < 0) continue
      out.push({ cards: five.map(c => c.id), kind: 'five-card', hand: hand.kind, key: [tier, hand.decider] })
    }
  }
  return out
}

function classifyFive(five, rankOf, suitOf, valueOf) {
  const ranks = five.map(rankOf).sort((a, b) => a - b)
  const flush = five.every(c => c.suit === five[0].suit)
  const straight = ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1) && ranks[0] >= 0
  const highest = Math.max(...five.map(valueOf))
  const counts = new Map()
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  if (straight && flush) return { kind: 'straight-flush', decider: highest }
  if (groups[0][1] === 4) return { kind: 'four-of-a-kind', decider: groups[0][0] }
  if (groups[0][1] === 3 && groups[1][1] === 2) return { kind: 'full-house', decider: groups[0][0] }
  if (flush) return { kind: 'flush', decider: highest }
  if (straight) return { kind: 'straight', decider: highest }
  return null
}

function choose(list, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) { out.push(prefix); return out }
  for (let i = start; i <= list.length - (k - prefix.length); i++) choose(list, k, i + 1, [...prefix, list[i]], out)
  return out
}

// Every way of taking one card from each group, in order.
function oneOfEach(groups) {
  let out = [[]]
  for (const group of groups) out = out.flatMap(prefix => group.map(c => [...prefix, c]))
  return out
}

function beats(a, b) {
  if (a.kind !== b.kind || a.cards.length !== b.cards.length) return false
  for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
    const x = a.key[i] ?? -1, y = b.key[i] ?? -1
    if (x !== y) return x > y
  }
  return false
}

function settings(ctx) {
  const c = ctx.config
  const rounds = c.rounds === undefined || c.rounds === null || c.rounds === 'open' ? null : Number(c.rounds)
  return {
    allowed: c.combinations || Object.keys(SIZES),
    fiveKinds: c.fiveCardHands || ['straight', 'flush', 'full-house', 'four-of-a-kind', 'straight-flush'],
    finishing: c.playTo === 'finishing-order',
    roles: c.roles || [],
    exchange: c.exchange || [],
    laterLead: c.laterLead ?? null,
    rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : null,
  }
}

// The seat that finished in a place: 1 is first out, -1 is last.
function atPlace(order, place) {
  return place > 0 ? order[place - 1] : order[order.length + place]
}

function nextStillIn(slice, from, seats) {
  for (let i = 1; i <= seats; i++) {
    const seat = (from + i) % seats
    if (!slice.out.includes(seat)) return seat
  }
  return from
}

// The best cards in a hand, by the game's order: what a lower role must give.
function best(hand, count, ctx) {
  const { valueOf } = ordering(ctx.config)
  return [...hand].sort((a, b) => valueOf(ctx.card(b)) - valueOf(ctx.card(a)) || (a < b ? -1 : 1)).slice(0, count)
}

// A round is over: record the order, and either the game is decided or the
// next round is dealt from the seed, the exchange made, and play begun.
function endRound(slice, order, ctx) {
  const s = settings(ctx)
  const seats = ctx.seats
  const titles = slice.titles.map((n, i) => (i === order[0] ? n + 1 : n))
  const round = slice.round + 1
  const roles = Array(seats).fill(null)
  for (const r of s.roles) {
    const seat = atPlace(order, r.place)
    if (seat !== undefined && roles[seat] === null) roles[seat] = r.title
  }
  const lastRound = { order }

  if (s.rounds !== null && round >= s.rounds) {
    const top = Math.max(...titles)
    const leaders = titles.map((n, i) => (n === top ? i : -1)).filter(i => i >= 0)
    // A tie for the most first places plays another round.
    if (leaders.length === 1) {
      return { ...slice, titles, round, roles, lastRound, out: [], trick: null, passes: 0, phase: 'over', finished: leaders[0], next: null }
    }
  }

  const ids = createRng((slice.seed ^ Math.imul(round + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const dealt = deal(ids, { ...(ctx.config.deal || {}), players: seats })
  const hands = dealt.hands.map(h => [...h])
  const owed = []
  for (const ex of s.exchange) {
    const giver = atPlace(order, ex.from)
    const taker = atPlace(order, ex.to)
    if (giver === undefined || taker === undefined || giver === taker) continue
    const given = best(hands[giver], ex.count, ctx)
    hands[giver] = hands[giver].filter(id => !given.includes(id))
    hands[taker] = [...hands[taker], ...given]
    owed.push({ seat: taker, to: giver, count: ex.count })
  }
  const leader = s.laterLead !== null ? atPlace(order, s.laterLead) : order[0]
  return {
    ...slice,
    hands,
    drawPile: dealt.drawPile || [],
    titles,
    round,
    roles,
    lastRound,
    out: [],
    trick: null,
    passes: 0,
    owed,
    leader,
    phase: owed.length ? 'exchange' : 'play',
    next: owed.length ? owed[0].seat : leader,
  }
}

export const climbing = {
  init(base, ctx) {
    const slice = { ...base, trick: null, passes: 0, finished: null, next: null }
    if (!settings(ctx).finishing) return slice
    return {
      ...slice,
      seed: ctx.seed || 1,
      phase: 'play',
      out: [],
      round: 0,
      titles: Array(ctx.seats).fill(0),
      roles: Array(ctx.seats).fill(null),
      owed: [],
      leader: null,
      lastRound: null,
    }
  },

  firstPlayer(slice, ctx) {
    const lead = ctx.config.firstLead
    if (!lead) return null
    const id = cardIdOf(lead)
    const seat = slice.hands.findIndex(h => h.includes(id))
    return seat >= 0 ? seat : null
  },

  legalMoves(slice, seat, ctx) {
    const { allowed, fiveKinds } = settings(ctx)
    if (slice.phase === 'exchange') {
      const owed = slice.owed[0]
      if (!owed || owed.seat !== seat) return []
      return choose(slice.hands[seat], owed.count).map(cards => ({ action: 'give', cards }))
    }
    if (slice.out && slice.out.includes(seat)) return []
    const all = combos(slice.hands[seat], ctx, allowed, fiveKinds)
    if (!slice.trick) return all.map(c => ({ action: 'play', cards: c.cards }))
    const moves = all.filter(c => beats(c, slice.trick.combo)).map(c => ({ action: 'play', cards: c.cards }))
    moves.push({ action: 'pass' })
    return moves
  },

  apply(move, slice, seat, ctx) {
    if (settings(ctx).finishing) return applyFinishing(move, slice, seat, ctx)
    if (move.action === 'pass') {
      const passes = slice.passes + 1
      // Everyone else has passed: the trick is won, and its winner leads.
      if (passes >= ctx.seats - 1) {
        return { ...slice, trick: null, passes: 0, next: slice.trick.by }
      }
      return { ...slice, passes, next: null }
    }
    const { allowed, fiveKinds } = settings(ctx)
    const played = combos(move.cards, ctx, allowed, fiveKinds).find(c => c.cards.length === move.cards.length)
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(id => !move.cards.includes(id)) : h))
    return {
      ...slice,
      hands,
      trick: { cards: move.cards, combo: { kind: played.kind, cards: played.cards, key: played.key }, by: seat },
      passes: 0,
      finished: hands[seat].length === 0 ? seat : null,
      next: null,
    }
  },

  winner(slice) {
    return slice.finished
  },

  // Each seat's own hand, and nobody else's. What was given in an exchange
  // is known to the two seats it passed between, and it is in their hands.
  project(slice, seat) {
    return {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))),
      drawPile: slice.drawPile.map(() => null),
    }
  },

  // Lead with what sheds the most cards for the least; follow with the least
  // that wins the trick, and pass when nothing does.
  policy(view, seat, moves, ctx) {
    const { valueOf } = ordering(ctx.config)
    if (view.phase === 'exchange') {
      // Return the lowest cards held.
      const worth = (m) => m.cards.reduce((n, id) => n + valueOf(ctx.card(id)), 0)
      return moves.reduce((low, m) => (worth(m) < worth(low) ? m : low), moves[0]) || null
    }
    const plays = moves.filter(m => m.action === 'play')
    if (!plays.length) return moves.find(m => m.action === 'pass') || null
    const cost = (m) => Math.max(...m.cards.map(id => valueOf(ctx.card(id))))
    const score = view.trick ? (m) => cost(m) : (m) => cost(m) - 24 * m.cards.length
    return plays.reduce((best, m) => (score(m) < score(best) ? m : best))
  },

  table(view, ctx) {
    if (!view.trick) return []
    const by = ctx.names[view.trick.by] || `Player ${view.trick.by + 1}`
    return [{ label: `${by} played${view.passes ? ` · ${view.passes} passed since` : ''}`, cards: view.trick.cards }]
  },

  describeSeat(view, seat, ctx) {
    if (!settings(ctx).finishing) return null
    const parts = []
    if (view.roles[seat]) parts.push(view.roles[seat])
    const place = view.out.indexOf(seat)
    if (place >= 0) parts.push(`out ${ordinal(place + 1)}`)
    parts.push(`${view.titles[seat]} first ${view.titles[seat] === 1 ? 'place' : 'places'}`)
    if (view.round) parts.push(`round ${view.round + 1}`)
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined || !settings(ctx).finishing) return null
    const shown = ctx.displayNames || ctx.names
    const n = slice.titles[slice.finished]
    return `${shown[slice.finished]} wins, first out in ${n} of ${slice.round} ${slice.round === 1 ? 'round' : 'rounds'}`
  },

  describe(move, ctx) {
    if (move.action === 'give') return `gives ${move.cards.length} back`
    if (move.action === 'pass') return 'pass'
    return move.cards.map(id => ctx.card(id)?.display || id).join(' ')
  },
}

function ordinal(n) {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')
  return `${n}${tail}`
}

// A round played to a full finishing order.
function applyFinishing(move, slice, seat, ctx) {
  const seats = ctx.seats
  if (move.action === 'give') {
    const owed = slice.owed[0]
    const hands = slice.hands.map((h, i) => {
      if (i === seat) return h.filter(id => !move.cards.includes(id))
      if (i === owed.to) return [...h, ...move.cards]
      return h
    })
    const rest = slice.owed.slice(1)
    return { ...slice, hands, owed: rest, phase: rest.length ? 'exchange' : 'play', next: rest.length ? rest[0].seat : slice.leader }
  }

  if (move.action === 'pass') {
    const passes = slice.passes + 1
    const leaderOut = slice.out.includes(slice.trick.by)
    const stillIn = seats - slice.out.length
    // Everyone still in who did not play the trick has passed on it.
    if (passes >= stillIn - (leaderOut ? 0 : 1)) {
      const leads = leaderOut ? nextStillIn(slice, slice.trick.by, seats) : slice.trick.by
      return { ...slice, trick: null, passes: 0, next: leads }
    }
    return { ...slice, passes, next: nextStillIn(slice, seat, seats) }
  }

  const { allowed, fiveKinds } = settings(ctx)
  const played = combos(move.cards, ctx, allowed, fiveKinds).find(c => c.cards.length === move.cards.length)
  const hands = slice.hands.map((h, i) => (i === seat ? h.filter(id => !move.cards.includes(id)) : h))
  const out = hands[seat].length === 0 ? [...slice.out, seat] : slice.out
  const after = {
    ...slice,
    hands,
    out,
    trick: { cards: move.cards, combo: { kind: played.kind, cards: played.cards, key: played.key }, by: seat },
    passes: 0,
  }
  const left = [...Array(seats).keys()].filter(i => !out.includes(i))
  if (left.length <= 1) return endRound(after, [...out, ...left], ctx)
  return { ...after, next: nextStillIn(after, seat, seats) }
}
