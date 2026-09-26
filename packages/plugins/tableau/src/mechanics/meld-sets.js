// Melds as the rummy family counts them (engine#184): "a set is three or four
// cards of the same rank" and "a run is three or more cards of the same suit
// in consecutive rank order". Aces are low - "A-2-3 is a valid run but Q-K-A
// is not" - and a card's value is its pips, 10 for a court card.
//
// Everything here takes card ids and the game's card lookup, so the shapes
// that use it (laying, knocking) never repeat the arithmetic.

const RANK = { A: 1, J: 11, Q: 12, K: 13 }

export function rankNumber(card) {
  return RANK[card.rank] ?? Number(card.rank)
}

function cardValue(card, values = {}) {
  if (values[card.rank] !== undefined) return Number(values[card.rank])
  const n = rankNumber(card)
  return n > 10 ? 10 : n
}

export function handValue(ids, ctx, values) {
  return ids.reduce((n, id) => n + cardValue(ctx.card(id), values), 0)
}

// What a group of cards is as a meld, or null.
export function meldKind(ids, ctx) {
  if (ids.length < 3) return null
  const cards = ids.map(id => ctx.card(id))
  const ranks = cards.map(rankNumber)
  if (ids.length <= 4 && ranks.every(r => r === ranks[0])) return 'set'
  if (!cards.every(c => c.suit === cards[0].suit)) return null
  const sorted = [...ranks].sort((a, b) => a - b)
  return sorted.every((r, i) => i === 0 || r === sorted[i - 1] + 1) ? 'run' : null
}

// Does this card extend this meld?
export function extendsMeld(meld, id, ctx) {
  return meldKind([...meld, id], ctx) !== null
}

// Every meld a hand can make, as lists of ids.
export function meldsIn(ids, ctx) {
  const out = []
  const byRank = new Map()
  const bySuit = new Map()
  for (const id of ids) {
    const c = ctx.card(id)
    const r = rankNumber(c)
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r).push(id)
    if (!bySuit.has(c.suit)) bySuit.set(c.suit, new Map())
    bySuit.get(c.suit).set(r, id)
  }
  for (const group of byRank.values()) {
    if (group.length >= 3) for (const three of choose(group, 3)) out.push(three)
    if (group.length === 4) out.push(group)
  }
  for (const ranks of bySuit.values()) {
    for (let start = 1; start <= 13; start++) {
      const run = []
      for (let r = start; ranks.has(r); r++) {
        run.push(ranks.get(r))
        if (run.length >= 3) out.push([...run])
      }
    }
  }
  return out
}

// The arrangement of a hand into non-overlapping melds that leaves the least
// deadwood: `{ melds, deadwood, value }`.
export function bestArrangement(ids, ctx, values) {
  const candidates = meldsIn(ids, ctx)
  let best = { melds: [], deadwood: ids, value: handValue(ids, ctx, values) }
  function search(from, used, chosen) {
    const rest = ids.filter(id => !used.has(id))
    const value = handValue(rest, ctx, values)
    if (value < best.value) best = { melds: chosen.map(m => [...m]), deadwood: rest, value }
    for (let i = from; i < candidates.length; i++) {
      const m = candidates[i]
      if (m.some(id => used.has(id))) continue
      for (const id of m) used.add(id)
      chosen.push(m)
      search(i + 1, used, chosen)
      chosen.pop()
      for (const id of m) used.delete(id)
    }
  }
  search(0, new Set(), [])
  return best
}

function choose(list, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) { out.push(prefix); return out }
  for (let i = start; i <= list.length - (k - prefix.length); i++) choose(list, k, i + 1, [...prefix, list[i]], out)
  return out
}

export function describeCards(ids, ctx) {
  return ids.map(id => ctx.card(id)?.display || id).join(' ')
}
