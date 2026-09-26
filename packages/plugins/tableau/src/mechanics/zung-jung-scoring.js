import { parseKind } from './mahjong-hands.js'

// Zung Jung (engine#184): Alan Kwan's Zung Jung Mahjong Scoring System,
// version 3.3 (zj-mahjong.info, CC BY-NC-SA 3.0 HK). There are 44 patterns
// in numbered series. A hand scores the sum of its patterns, at most one from
// each series ("you cannot count multiple patterns from the same series"),
// except Value Honor, 10 for each set. A hand with no pattern, a chicken
// hand, scores 1. The limit is 320: a sum of 320 or more scores 320, and a
// hand holding a pattern listed at 320 or more scores that single highest
// pattern.

const terminalOrHonour = (p) => !p.suited || p.rank === 1 || p.rank === 9
const terminal = (p) => p.suited && (p.rank === 1 || p.rank === 9)
const tilesOf = (set) => {
  const p = parseKind(set.kind)
  return set.type === 'chow' ? [0, 1, 2].map(d => ({ ...p, rank: p.rank + d })) : [p]
}
const NINE_GATES = [3, 1, 1, 1, 1, 1, 1, 1, 3]

// Suits in which a rank has a set of this kind.
const suitsAt = (sets, rank) => new Set(sets.map(s => parseKind(s.kind)).filter(p => p.suited && p.rank === rank).map(p => p.suit))

function regularPatterns(hand, add) {
  const pungs = hand.sets.filter(s => s.type !== 'chow')
  const chows = hand.sets.filter(s => s.type === 'chow')
  const suitOf = (s) => parseKind(s.kind).suit
  const pair = parseKind(hand.pair)
  if (chows.length === 4) add('1.1', 'All Sequences', 5)
  if (hand.concealed) add('1.2', 'Concealed Hand', 5)
  // Value Honor: every dragon set, and the seat wind; the prevailing wind is not recognised.
  for (const s of pungs) {
    const p = parseKind(s.kind)
    if (p.suit === 'dragon' || (p.suit === 'wind' && p.rank === hand.seatWind)) add(`3.1 ${s.kind}`, 'Value Honor', 10)
  }
  const dragons = pungs.filter(s => suitOf(s) === 'dragon').length
  if (dragons === 3) add('3.2', 'Big Three Dragons', 130)
  else if (dragons === 2 && pair.suit === 'dragon') add('3.2', 'Small Three Dragons', 40)
  const winds = pungs.filter(s => suitOf(s) === 'wind').length
  const windPair = pair.suit === 'wind'
  if (winds === 4) add('3.3', 'Big Four Winds', 400)
  else if (winds === 3 && windPair) add('3.3', 'Small Four Winds', 320)
  else if (winds === 3) add('3.3', 'Big Three Winds', 120)
  else if (winds === 2 && windPair) add('3.3', 'Small Three Winds', 30)
  if (pungs.length === 4) add('4.1', 'All Triplets', 30)
  const concealedPungs = pungs.filter(s => !s.open).length
  if (concealedPungs >= 2) add('4.2', ['Two', 'Three', 'Four'][concealedPungs - 2] + ' Concealed Triplets', [5, 30, 125][concealedPungs - 2])
  const kongs = pungs.filter(s => s.type === 'kong').length
  if (kongs) add('4.3', ['One Kong', 'Two Kong', 'Three Kong', 'Four Kong'][kongs - 1], [5, 20, 120, 480][kongs - 1])
  // Identical sequences: the same chow twice, twice over, three or four times.
  const same = new Map()
  for (const c of chows) same.set(c.kind, (same.get(c.kind) || 0) + 1)
  const counts = [...same.values()]
  if (counts.includes(4)) add('5.1', 'Four Identical Sequences', 480)
  else if (counts.includes(3)) add('5.1', 'Three Identical Sequences', 120)
  else if (counts.filter(n => n === 2).length === 2) add('5.1', 'Two Identical Sequences Twice', 60)
  else if (counts.includes(2)) add('5.1', 'Two Identical Sequences', 10)
  for (let r = 1; r <= 9; r++) {
    if (suitsAt(chows, r).size === 3) add('6.1', 'Three Similar Sequences', 35)
    const at = suitsAt(pungs, r)
    if (at.size === 3) add('6.2', 'Three Similar Triplets', 120)
    else if (at.size === 2 && pair.suited && pair.rank === r && !at.has(pair.suit)) add('6.2', 'Small Three Similar Triplets', 30)
  }
  for (const suit of new Set(chows.map(suitOf))) {
    if ([1, 4, 7].every(r => chows.some(c => c.kind === `${suit}_${r}`))) add('7.1', 'Nine-Tile Straight', 40)
  }
  for (const suit of new Set(pungs.map(suitOf))) {
    const ranks = new Set(pungs.map(s => parseKind(s.kind)).filter(p => p.suit === suit && p.suited).map(p => p.rank))
    let run = 0
    for (let r = 1; r <= 9; r++) {
      run = ranks.has(r) ? run + 1 : 0
      if (run >= 4) add('7.2', 'Four Consecutive Triplets', 200)
      else if (run === 3) add('7.2', 'Three Consecutive Triplets', 100)
    }
  }
  const groups = [...hand.sets.map(tilesOf), [pair]]
  if (groups.every(g => g.some(terminal))) add('8.1', 'Pure Lesser Terminals', 50)
  else if (groups.every(g => g.some(terminalOrHonour))) add('8.1', 'Mixed Lesser Terminals', 40)
  return pungs.length === 4
}

export function zungJung(hand) {
  const found = new Map()
  const add = (series, name, value) => {
    const was = found.get(series)
    if (!was || value > was[1]) found.set(series, [name, value])
  }
  const kinds = hand.kinds.map(parseKind)
  const suits = new Set(kinds.filter(k => k.suited).map(k => k.suit))
  let allTriplets = false
  if (hand.special === 'thirteen-orphans') add('10.1', 'Thirteen Terminals', 160)
  if (hand.special === 'seven-pairs') add('10.2', 'Seven Pairs', 30)
  if (!hand.special) allTriplets = regularPatterns(hand, add)
  if (suits.size === 1) add('2.1', kinds.some(k => !k.suited) ? 'Mixed One-Suit' : 'Pure One-Suit', kinds.some(k => !k.suited) ? 40 : 80)
  if (hand.concealed && hand.kinds.length === 14 && suits.size === 1 && kinds.every(k => k.suited) && hand.winning) {
    const [suit] = suits
    const rest = [...hand.kinds]
    rest.splice(rest.indexOf(hand.winning), 1)
    if (NINE_GATES.every((n, i) => rest.filter(k => k === `${suit}_${i + 1}`).length === n)) add('2.2', 'Nine Gates', 480)
  }
  if (!suits.size) add('3.4', 'All Honors', 320)
  if (kinds.every(k => !terminalOrHonour(k))) add('1.3', 'No Terminals', 5)
  if (kinds.every(terminal)) add('8.1', 'Pure Greater Terminals', 400)
  else if ((allTriplets || hand.special === 'seven-pairs') && kinds.every(terminalOrHonour)) add('8.1', 'Mixed Greater Terminals', 100)
  if (hand.lastTile && hand.selfDrawn) add('9.1', 'Final Draw', 10)
  if (hand.lastTile && !hand.selfDrawn && !hand.robbing) add('9.1', 'Final Discard', 10)
  if (hand.afterKong && hand.selfDrawn) add('9.2', 'Win on Kong', 10)
  if (hand.robbing) add('9.3', 'Robbing a Kong', 10)
  if (hand.blessing === 'heaven') add('9.4', 'Blessing of Heaven', 155)
  if (hand.blessing === 'man' && hand.dealersFirstDiscard) add('9.4', 'Blessing of Earth', 155)
  const patterns = [...found.values()]
  if (!patterns.length) return { value: 1, patterns: [['Chicken Hand', 1]], rank: 1 }
  const listed = patterns.filter(([, v]) => v >= 320).sort((a, b) => b[1] - a[1])
  if (listed.length) return { value: listed[0][1], patterns: [listed[0]], limit: 'Listed Limit Hand', rank: listed[0][1] }
  const sum = patterns.reduce((n, [, v]) => n + v, 0)
  return sum >= 320 ? { value: 320, patterns, limit: 'Compound Limit Hand', rank: 320 } : { value: sum, patterns, rank: sum }
}

// The Formal Competition Scheme: the winner always collects 3 times the
// hand. Self-drawn, or with no one responsible, each player pays the hand's
// value. Won on a discard, a hand of 25 or less is still split equally; above
// 25, the others pay 25 each and the responsible player pays the rest.
export function zungJungPays(value, { responsible }) {
  if (responsible === null || value.value <= 25) return value.value
  return responsible ? 3 * value.value - 50 : 25
}
