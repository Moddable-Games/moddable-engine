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
  return {
    allowed: c.combinations || Object.keys(SIZES),
    fiveKinds: c.fiveCardHands || ['straight', 'flush', 'full-house', 'four-of-a-kind', 'straight-flush'],
  }
}

export const climbing = {
  init(base) {
    return { ...base, trick: null, passes: 0, finished: null, next: null }
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
    const all = combos(slice.hands[seat], ctx, allowed, fiveKinds)
    if (!slice.trick) return all.map(c => ({ action: 'play', cards: c.cards }))
    const moves = all.filter(c => beats(c, slice.trick.combo)).map(c => ({ action: 'play', cards: c.cards }))
    moves.push({ action: 'pass' })
    return moves
  },

  apply(move, slice, seat, ctx) {
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

  // Lead with what sheds the most cards for the least; follow with the least
  // that wins the trick, and pass when nothing does.
  policy(view, seat, moves, ctx) {
    const { valueOf } = ordering(ctx.config)
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

  describe(move, ctx) {
    if (move.action === 'pass') return 'pass'
    return move.cards.map(id => ctx.card(id)?.display || id).join(' ')
  },
}
