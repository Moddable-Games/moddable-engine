import { parseKind } from './mahjong-hands.js'

// American mahjong before the card (engine#184): the Standard Score Sheet of
// Babcock's Rules for Mah-Jongg, the Red Book, second edition (1923, public
// domain). Every hand is scored, the losers' as well as the winner's.
//
//   Three of a kind, 2 to 8, exposed 2; ones, nines, winds and dragons twice
//   that; four of a kind four times three; concealed twice exposed. A pair of
//   dragons or of the player's own wind 2. Runs score nothing.
//   The winner adds 20 for Mah-Jongg, 2 for drawing the winning tile, 8 more
//   on a loose tile after a kong, 2 for the only possible place to win, 10 for
//   no runs, 10 for stealing the fourth, 10 on the last tile drawn, and 10
//   when there is no other score at all.
//   Doubles, for every hand: each set of dragons, a set of the own wind, one
//   suit with honours; three doubles for one suit only or honours only.
//   The limit is 300 unless the players agree otherwise. The Hand from
//   Heaven scores the limit, the Hand from Earth half of it.

const terminalOrHonour = (p) => !p.suited || p.rank === 1 || p.rank === 9
const valuedPair = (p, seatWind) => p.suit === 'dragon' || (p.suit === 'wind' && p.rank === seatWind)

function setPoints(set) {
  const p = parseKind(set.kind)
  const base = set.type === 'kong' ? 8 : 2
  return base * (terminalOrHonour(p) ? 2 : 1) * (set.open ? 1 : 2)
}

const setName = (set) => `${set.type === 'kong' ? 'four' : 'three'} ${set.kind.replace('_', ' ')}, ${set.open ? 'exposed' : 'concealed'}`

// The doubles a hand earns from its sets and its suits.
function doubles(sets, kinds, seatWind) {
  const out = []
  for (const s of sets) {
    const p = parseKind(s.kind)
    if (p.suit === 'dragon') out.push([`three ${s.kind.replace('_', ' ')}`, 1])
    if (p.suit === 'wind' && p.rank === seatWind) out.push(['three of own wind', 1])
  }
  const parsed = kinds.map(parseKind)
  const suits = new Set(parsed.filter(k => k.suited).map(k => k.suit))
  const honours = parsed.some(k => !k.suited)
  if (suits.size === 1 && honours) out.push(['one suit with honours', 1])
  if (suits.size === 1 && !honours) out.push(['all one suit', 3])
  if (suits.size === 0) out.push(['all honours', 3])
  return out
}

function total(points, doubled, limit) {
  const times = doubled.reduce((n, [, d]) => n + d, 0)
  return Math.min(limit, points.reduce((n, [, v]) => n + v, 0) * 2 ** times)
}

// The winning hand, one reading of it.
export function redBook(hand, config = {}) {
  const limit = Number(config.limit ?? 300)
  const points = [['Mah-Jongg', 20]]
  const pungs = hand.sets.filter(s => s.type !== 'chow')
  for (const s of pungs) points.push([setName(s), setPoints(s)])
  const pair = parseKind(hand.pair)
  if (valuedPair(pair, hand.seatWind)) points.push(['valued pair', 2])
  if (hand.selfDrawn) points.push(['winning tile drawn', 2])
  if (hand.selfDrawn && hand.afterKong) points.push(['loose tile after four of a kind', 8])
  if (hand.onlyPlace) points.push(['only possible place', 2])
  if (!hand.sets.some(s => s.type === 'chow')) points.push(['no runs', 10])
  if (hand.robbing) points.push(['stealing the fourth', 10])
  if (hand.selfDrawn && hand.lastTile) points.push(['last tile drawn', 10])
  const doubled = doubles(pungs, hand.kinds, hand.seatWind)
  if (points.length === 1 && !doubled.length) points.push(['no score other than game', 10])
  let value = total(points, doubled, limit)
  const patterns = [...points, ...doubled.map(([name, d]) => [name, `×${2 ** d}`])]
  if (hand.blessing === 'heaven' && value < limit) { value = limit; patterns.push(['Hand from Heaven', 'limit']) }
  if (hand.blessing === 'man' && hand.dealersFirstDiscard && value < limit / 2) { value = limit / 2; patterns.push(['Hand from Earth', 'half limit']) }
  return { value, patterns, rank: value }
}

// A losing hand: its declared sets, and the concealed tiles grouped as well
// as they can be, each three or more of a kind a concealed set and each pair
// of dragons or own wind a pair.
export function redBookLoser(hand, config = {}) {
  const limit = Number(config.limit ?? 300)
  const counts = new Map()
  for (const k of hand.concealedKinds) counts.set(k, (counts.get(k) || 0) + 1)
  const sets = [...hand.sets]
  const points = []
  for (const [kind, n] of counts) {
    if (n >= 3) sets.push({ type: 'pung', kind, open: false })
    else if (n === 2 && valuedPair(parseKind(kind), hand.seatWind)) points.push(['valued pair', 2])
  }
  for (const s of sets) points.push([setName(s), setPoints(s)])
  return { value: total(points, doubles(sets, hand.kinds, hand.seatWind), limit) }
}

// Every loser pays the winner the winner's score; East pays, and is paid, double.
export function redBookPays(value, { winnerIsDealer, payerIsDealer }) {
  return value.value * (winnerIsDealer || payerIsDealer ? 2 : 1)
}
