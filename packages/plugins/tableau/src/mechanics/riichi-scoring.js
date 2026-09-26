import { parseKind } from './mahjong-hands.js'

// Riichi (engine#184), scored as the European Mahjong Association's Riichi
// Competition Rules (April 2016) score it. A hand needs at least one yaku;
// dora add han but are not yaku. Han and fu give the basic points,
// fu × 2^(2 + han), never more than a mangan's 2,000, and named limits
// above that: 5 han mangan, 6-7 haneman, 8-10 baiman, 11 or more sanbaiman
// ("a hand with 13+ fan is scored as a sanbaiman"). A yakuman is 8,000, and
// "yakuman are not cumulative". Blessing of Man is a mangan, "not
// cumulative with other yaku and dora".
//
// The reading scored is wall.js's: { sets, pair, special, kinds, seatWind,
// roundWind, selfDrawn, concealed, wait, afterKong, lastTile, robbing,
// riichi, doubleRiichi, ippatsu, blessing, dora, uraDora }.

const GREEN = new Set(['bamboo_2', 'bamboo_3', 'bamboo_4', 'bamboo_6', 'bamboo_8', 'dragon_green'])

const terminalOrHonour = (p) => !p.suited || p.rank === 1 || p.rank === 9
const terminal = (p) => p.suited && (p.rank === 1 || p.rank === 9)
const tilesOf = (set) => {
  const p = parseKind(set.kind)
  return set.type === 'chow' ? [0, 1, 2].map(d => ({ ...p, rank: p.rank + d })) : [p]
}
const pungLike = (set) => set.type === 'pung' || set.type === 'kong'

function facts(hand) {
  const kinds = hand.kinds.map(parseKind)
  const suits = new Set(kinds.filter(k => k.suited).map(k => k.suit))
  const honours = kinds.some(k => !k.suited)
  const pungs = hand.sets.filter(pungLike)
  const chows = hand.sets.filter(s => s.type === 'chow')
  const suitOf = (set) => parseKind(set.kind).suit
  const dragonPungs = pungs.filter(s => suitOf(s) === 'dragon')
  const windPungs = pungs.filter(s => suitOf(s) === 'wind')
  const pair = hand.pair ? parseKind(hand.pair) : null
  return { kinds, suits, honours, pungs, chows, dragonPungs, windPungs, pair }
}

// A pair worth fu, and never pinfu: a dragon, the seat wind or the prevalent wind.
function pairFu(hand, pair) {
  if (!pair || pair.suited) return 0
  if (pair.suit === 'dragon') return 2
  return (pair.rank === hand.seatWind ? 2 : 0) + (pair.rank === hand.roundWind ? 2 : 0)
}

function isPinfu(hand, f) {
  return hand.concealed && !hand.special && f.chows.length === 4 && pairFu(hand, f.pair) === 0 && hand.wait === 'two-sided'
}

function yakuman(hand, f) {
  const out = []
  const counts = new Map()
  for (const k of hand.kinds) counts.set(k, (counts.get(k) || 0) + 1)
  if (hand.special === 'thirteen-orphans') out.push('Thirteen Orphans')
  if (hand.blessing === 'heaven') out.push('Blessing of Heaven')
  if (hand.blessing === 'earth') out.push('Blessing of Earth')
  if (hand.special) return out
  // Fourteen tiles: a concealed kong is not Nine Gates.
  if (hand.concealed && hand.kinds.length === 14 && f.suits.size === 1 && !f.honours) {
    const [suit] = f.suits
    const n = (r) => counts.get(`${suit}_${r}`) || 0
    if (n(1) >= 3 && n(9) >= 3 && [2, 3, 4, 5, 6, 7, 8].every(r => n(r) >= 1)) out.push('Nine Gates')
  }
  if (f.pungs.length === 4 && f.pungs.every(s => !s.open)) out.push('Four Concealed Pungs')
  if (hand.sets.filter(s => s.type === 'kong').length === 4) out.push('Four Kongs')
  if (hand.kinds.every(k => GREEN.has(k))) out.push('All Green')
  if (f.kinds.every(terminal)) out.push('All Terminals')
  if (f.kinds.every(k => !k.suited)) out.push('All Honours')
  if (f.dragonPungs.length === 3) out.push('Big Three Dragons')
  if (f.windPungs.length === 4) out.push('Big Four Winds')
  else if (f.windPungs.length === 3 && f.pair && f.pair.suit === 'wind') out.push('Little Four Winds')
  return out
}

function yaku(hand, f) {
  const p = []
  const add = (name, han) => p.push([name, han])
  const closed = hand.concealed
  const byClosed = (c, o) => (closed ? c : o)
  if (hand.riichi) add('Riichi', 1)
  if (hand.doubleRiichi) add('Double riichi', 1)
  if (hand.ippatsu) add('Ippatsu', 1)
  if (closed && hand.selfDrawn) add('Fully concealed hand', 1)
  if (f.kinds.every(k => !terminalOrHonour(k))) add('All simples', 1)
  if (hand.afterKong && hand.selfDrawn) add('After a kong', 1)
  if (hand.robbing) add('Robbing the kong', 1)
  if (hand.lastTile && hand.selfDrawn && !hand.afterKong) add('Under the sea', 1)
  if (hand.lastTile && !hand.selfDrawn && !hand.robbing) add('Under the river', 1)
  if (f.suits.size === 1 && f.honours) add('Half flush', byClosed(3, 2))
  if (f.suits.size === 1 && !f.honours) add('Full flush', byClosed(6, 5))
  if (f.suits.size && f.honours && f.kinds.every(terminalOrHonour)) add('All terminals and honours', 2)
  if (hand.special === 'seven-pairs') {
    add('Seven pairs', 2)
    return p
  }
  if (isPinfu(hand, f)) add('Pinfu', 1)
  // Identical chows: one pair of them, or two.
  const chowCounts = new Map()
  for (const c of f.chows) chowCounts.set(c.kind, (chowCounts.get(c.kind) || 0) + 1)
  const doubles = [...chowCounts.values()].reduce((n, c) => n + Math.floor(c / 2), 0)
  if (closed && doubles === 2) add('Twice pure double chows', 3)
  else if (closed && doubles === 1) add('Pure double chow', 1)
  const rankIn = (sets, rank) => new Set(sets.filter(s => parseKind(s.kind).suited && parseKind(s.kind).rank === rank).map(s => parseKind(s.kind).suit)).size === 3
  if ([1, 2, 3, 4, 5, 6, 7].some(r => rankIn(f.chows, r))) add('Mixed triple chow', byClosed(2, 1))
  if ([...f.suits].some(suit => [1, 4, 7].every(r => f.chows.some(c => c.kind === `${suit}_${r}`)))) add('Pure straight', byClosed(2, 1))
  f.dragonPungs.forEach(() => add('Dragon pung', 1))
  for (const set of f.windPungs) {
    const wind = parseKind(set.kind).rank
    if (wind === hand.seatWind) add('Seat wind', 1)
    if (wind === hand.roundWind) add('Prevalent wind', 1)
  }
  const groups = [...hand.sets.map(tilesOf), [f.pair]]
  if (f.chows.length && groups.every(g => g.some(terminal))) add('Terminals in all sets', byClosed(3, 2))
  else if (f.chows.length && f.honours && groups.every(g => g.some(terminalOrHonour))) add('Outside hand', byClosed(2, 1))
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9].some(r => rankIn(f.pungs, r))) add('Triple pung', 2)
  const concealedPungs = f.pungs.filter(s => !s.open).length
  if (concealedPungs === 3) add('Three concealed pungs', 2)
  if (hand.sets.filter(s => s.type === 'kong').length === 3) add('Three kongs', 2)
  if (f.pungs.length === 4) add('All pungs', 2)
  if (f.dragonPungs.length === 2 && f.pair && f.pair.suit === 'dragon') add('Little three dragons', 2)
  return p
}

function fu(hand, f) {
  if (hand.special === 'seven-pairs') return 25
  if (isPinfu(hand, f)) return hand.selfDrawn ? 20 : 30
  let n = 20
  if (hand.concealed && !hand.selfDrawn) n += 10
  for (const set of f.pungs) {
    const base = set.type === 'kong' ? 8 : 2
    n += base * (set.open ? 1 : 2) * (terminalOrHonour(parseKind(set.kind)) ? 2 : 1)
  }
  n += pairFu(hand, f.pair)
  if (hand.wait === 'edge' || hand.wait === 'closed' || hand.wait === 'pair') n += 2
  if (hand.selfDrawn) n += 2
  // Open pinfu: an open hand worth no minipoints is given two.
  if (!hand.concealed && n === 20) n += 2
  return Math.ceil(n / 10) * 10
}

const LIMITS = [[11, 6000, 'Sanbaiman'], [8, 4000, 'Baiman'], [6, 3000, 'Haneman'], [5, 2000, 'Mangan']]

function basicPoints(han, minipoints) {
  const limit = LIMITS.find(([at]) => han >= at)
  if (limit) return { basic: limit[1], limit: limit[2] }
  const basic = minipoints * 2 ** (2 + han)
  return basic >= 2000 ? { basic: 2000, limit: 'Mangan' } : { basic, limit: null }
}

// A hand's value, or null when it has no yaku.
export function riichi(hand) {
  const f = facts(hand)
  const limits = yakuman(hand, f)
  if (limits.length) return { value: 13, fu: 0, basic: 8000, limit: 'Yakuman', patterns: limits.map(name => [name, 'yakuman']), rank: 8000 }
  const found = yaku(hand, f)
  const renho = hand.blessing === 'man' ? { value: 5, fu: 0, basic: 2000, limit: 'Mangan', patterns: [['Blessing of Man', 'mangan']], rank: 2000 } : null
  if (!found.length) return renho
  if (hand.dora) found.push(['Dora', hand.dora])
  if (hand.uraDora) found.push(['Ura dora', hand.uraDora])
  const han = found.reduce((n, [, v]) => n + v, 0)
  const minipoints = fu(hand, f)
  const { basic, limit } = basicPoints(han, minipoints)
  const scored = { value: han, fu: minipoints, basic, limit, patterns: found, rank: basic + han / 100 }
  return renho && renho.basic > basic ? renho : scored
}

const up = (n) => Math.ceil(n / 100) * 100

// What one payer owes for a hand: on a discard the discarder pays 6 × basic
// to the dealer or 4 × basic to anyone else; on a self-draw the dealer pays,
// or is paid, 2 × basic and everyone else 1 × basic. Each rounded up to 100.
export function riichiPays(value, { selfDrawn, winnerIsDealer, payerIsDealer }) {
  if (!selfDrawn) return up(value.basic * (winnerIsDealer ? 6 : 4))
  return up(value.basic * (winnerIsDealer || payerIsDealer ? 2 : 1))
}
