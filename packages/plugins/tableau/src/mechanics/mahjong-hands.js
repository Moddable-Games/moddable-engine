// Mahjong hands (engine#184): what a tile is, and every way a hand can be
// read as four sets and a pair, for the scorers to value. Shared by every
// mahjong shape; no game's scoring is here.

export const kindOf = (tile) => `${tile.suit}_${tile.rank}`
export const isBonus = (tile) => tile.category === 'bonus'

// A kind's parts, from its name: `bamboo_3` is the 3 of bamboo.
export function parseKind(kind) {
  const [suit, rank] = kind.split('_')
  const n = Number(rank)
  return { suit, rank: Number.isNaN(n) ? rank : n, suited: !Number.isNaN(n) }
}

function countKinds(kinds) {
  const counts = new Map()
  for (const k of kinds) counts.set(k, (counts.get(k) || 0) + 1)
  return counts
}

const next = (kind, step) => {
  const p = parseKind(kind)
  return p.suited && p.rank + step <= 9 ? `${p.suit}_${p.rank + step}` : null
}

// Every reading of these concealed kinds as `sets` sets and one pair:
// [{ sets: [{ type: 'pung' | 'chow', kind }], pair }]. A chow is named by its lowest tile.
export function arrangements(kinds, sets) {
  const out = []
  const counts = countKinds(kinds)
  const keys = [...counts.keys()].sort()
  function place(found, pair) {
    const first = keys.find(k => counts.get(k) > 0)
    if (!first) {
      if (found.length === sets && pair) out.push({ sets: [...found], pair })
      return
    }
    if (!pair && counts.get(first) >= 2) {
      counts.set(first, counts.get(first) - 2)
      place(found, first)
      counts.set(first, counts.get(first) + 2)
    }
    if (found.length < sets && counts.get(first) >= 3) {
      counts.set(first, counts.get(first) - 3)
      place([...found, { type: 'pung', kind: first }], pair)
      counts.set(first, counts.get(first) + 3)
    }
    const b = next(first, 1), c = next(first, 2)
    if (found.length < sets && b && c && counts.get(b) > 0 && counts.get(c) > 0) {
      for (const k of [first, b, c]) counts.set(k, counts.get(k) - 1)
      place([...found, { type: 'chow', kind: first }], pair)
      for (const k of [first, b, c]) counts.set(k, counts.get(k) + 1)
    }
  }
  place([], null)
  return out
}

export function isSevenPairs(kinds) {
  if (kinds.length !== 14) return false
  const counts = countKinds(kinds)
  return counts.size === 7 && [...counts.values()].every(n => n === 2)
}

const ORPHANS = ['bamboo_1', 'bamboo_9', 'circles_1', 'circles_9', 'characters_1', 'characters_9', 'wind_east', 'wind_south', 'wind_west', 'wind_north', 'dragon_red', 'dragon_green', 'dragon_white']
export function isThirteenOrphans(kinds) {
  if (kinds.length !== 14) return false
  const counts = countKinds(kinds)
  return ORPHANS.every(k => counts.has(k)) && [...counts.keys()].every(k => ORPHANS.includes(k))
}

// Every kind in `universe` that would complete these concealed kinds as
// `sets` sets and a pair, or, with `specials` and no melds, as seven pairs
// or thirteen orphans. An empty list is a hand that is not waiting.
export function waits(kinds, sets, specials, universe) {
  return universe.filter(k => {
    const whole = [...kinds, k]
    return arrangements(whole, sets).length > 0 || (specials && (isSevenPairs(whole) || isThirteenOrphans(whole)))
  })
}

// Each way the winning tile can sit in one reading: finishing the pair, a
// pung, or a chow on its edge, in its middle, or at either open end.
export function placements(reading, winning) {
  const out = []
  if (!winning) return [{ wait: null, index: -1 }]
  if (reading.pair === winning) out.push({ wait: 'pair', index: -1 })
  const w = parseKind(winning)
  reading.sets.forEach((set, index) => {
    if (set.type === 'pung' && set.kind === winning) out.push({ wait: 'pung', index })
    if (set.type !== 'chow') return
    const low = parseKind(set.kind)
    if (low.suit !== w.suit) return
    const d = w.rank - low.rank
    if (d === 1) out.push({ wait: 'closed', index })
    if (d === 0) out.push({ wait: low.rank === 7 ? 'edge' : 'two-sided', index })
    if (d === 2) out.push({ wait: low.rank === 1 ? 'edge' : 'two-sided', index })
  })
  return out
}

// The dora an indicator points to: the next number of its suit, 9 wrapping
// to 1; the next wind, east, south, west, north; the next dragon, white,
// green, red.
const SUCCESSION = { wind: ['east', 'south', 'west', 'north'], dragon: ['white', 'green', 'red'] }
export function doraAfter(kind) {
  const p = parseKind(kind)
  if (p.suited) return `${p.suit}_${p.rank % 9 + 1}`
  const order = SUCCESSION[p.suit]
  return `${p.suit}_${order[(order.indexOf(p.rank) + 1) % order.length]}`
}
