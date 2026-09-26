import { parseKind } from './mahjong-hands.js'
import { riichi, riichiPays } from './riichi-scoring.js'

// How each mahjong game values a winning hand (engine#184). A scorer is given
// one reading of the hand:
//
//   { sets: [{ type: pung | kong | chow, kind, open }], pair, special,
//     kinds, bonus, seatWind, roundWind, seat, selfDrawn, concealed,
//     afterKong, lastTile, robbing }
//
// and returns { value, patterns: [[name, value]], limit }.

const WINDS = ['east', 'south', 'west', 'north']

function shape(hand) {
  const kinds = hand.kinds.map(parseKind)
  const suits = new Set(kinds.filter(k => k.suited).map(k => k.suit))
  const honours = kinds.some(k => !k.suited)
  const pungs = hand.sets.filter(s => s.type !== 'chow')
  const dragonPungs = pungs.filter(s => parseKind(s.kind).suit === 'dragon')
  const windPungs = pungs.filter(s => parseKind(s.kind).suit === 'wind')
  const pair = hand.pair ? parseKind(hand.pair) : null
  const terminalOrHonour = (k) => !k.suited || k.rank === 1 || k.rank === 9
  return { kinds, suits, honours, pungs, dragonPungs, windPungs, pair, terminalOrHonour }
}

// Hong Kong, from Wikipedia's "Hong Kong mahjong scoring rules".
export function hongKong(hand) {
  const p = []
  const add = (name, v) => p.push([name, v])
  const s = shape(hand)
  if (hand.special === 'thirteen-orphans') add('Thirteen Orphans', 13)
  if (hand.special !== 'thirteen-orphans') {
    const allPungs = !hand.special && hand.sets.every(x => x.type !== 'chow')
    if (!hand.special && hand.sets.every(x => x.type === 'chow')) add('Common Hand', 1)
    if (allPungs) add('All in Triplets', 3)
    if (hand.special === 'seven-pairs') add('Seven Pairs', 4)
    if (s.suits.size === 1 && s.honours) add('Mixed One Suit', 3)
    if (s.suits.size === 1 && !s.honours) add('All One Suit', 7)
    if (s.suits.size === 0) add('All Honour Tiles', 10)
    if (s.kinds.every(s.terminalOrHonour) && s.honours && s.suits.size) add('Mixed Orphans', 1)
    if (s.kinds.every(k => k.suited && (k.rank === 1 || k.rank === 9))) add('Orphans', 10)
    if (s.dragonPungs.length === 3) add('Great Dragons', 8)
    else if (s.dragonPungs.length === 2 && s.pair && s.pair.suit === 'dragon') add('Small Dragons', 5)
    if (s.windPungs.length === 4) add('Great Winds', 13)
    else if (s.windPungs.length === 3 && s.pair && s.pair.suit === 'wind') add('Small Winds', 6)
    if (allPungs && hand.sets.every(x => !x.open)) add('Self Triplets', 10)
    if (hand.sets.length === 4 && hand.sets.every(x => x.type === 'kong')) add('All Kongs', 13)
    for (const set of s.dragonPungs) add(`${parseKind(set.kind).rank} dragon`, 1)
    for (const set of s.windPungs) {
      const wind = parseKind(set.kind).rank
      if (wind === hand.seatWind) add('Seat Wind', 1)
      if (wind === hand.roundWind) add('Prevailing Wind', 1)
    }
  }
  // Flowers and seasons.
  const flowers = hand.bonus.filter(b => b.suit === 'flower')
  const seasons = hand.bonus.filter(b => b.suit === 'season')
  if (!hand.bonus.length) add('No Flowers or Seasons', 1)
  const own = WINDS.indexOf(hand.seatWind) + 1
  if (flowers.some(b => b.rank === own)) add('Own Flower', 1)
  if (seasons.some(b => b.rank === own)) add('Own Season', 1)
  if (flowers.length === 4) add('All Flowers', 2)
  if (seasons.length === 4) add('All Seasons', 2)
  // How it was won.
  if (hand.selfDrawn) add('Self-Pick', 1)
  if (hand.concealed) add('Win from Wall', 1)
  if (hand.robbing) add('Robbing Kong', 1)
  if (hand.lastTile) add('Win by Last Catch', 1)
  if (hand.afterKong) add('Win by Kong', 1)
  const value = Math.min(13, p.reduce((n, [, v]) => n + v, 0))
  return { value, patterns: p }
}

// Taiwanese, from the frontmatter's own table: the tai each pattern earns,
// since sources differ and players agree on them. A pattern with no value
// there scores nothing. `base` is the least a winning hand is worth.
//
//     tai: { base: 1, bonusTile: 1, dragonPung: ..., ownWindPung: ..., allPungs: ..., allChows: ... }
function taiwanese(hand, tai = {}) {
  const p = []
  const add = (name, v) => { if (v) p.push([name, v]) }
  const s = shape(hand)
  for (let k = 0; k < s.dragonPungs.length; k++) add('Dragon pung', Number(tai.dragonPung || 0))
  for (const set of s.windPungs) if (parseKind(set.kind).rank === hand.seatWind) add('Own wind pung', Number(tai.ownWindPung || 0))
  if (hand.sets.length && hand.sets.every(x => x.type !== 'chow')) add('All Pungs', Number(tai.allPungs || 0))
  if (hand.sets.length && hand.sets.every(x => x.type === 'chow')) add('All Chows', Number(tai.allChows || 0))
  for (let k = 0; k < hand.bonus.length; k++) add('Bonus tile', Number(tai.bonusTile ?? 1))
  const value = Math.max(Number(tai.base ?? 1), p.reduce((n, [, v]) => n + v, 0))
  return { value, patterns: p.length ? p : [['Base hand', value]] }
}

// How each game values a hand and pays for it. Hong Kong: points double with
// each faan ("full spicy"), a self-drawn win paid one and a half times by
// everyone. Taiwanese: a tai is a point, every payer pays the same, and the
// dealer pays and receives double. Riichi: han and fu make basic points,
// which riichi-scoring.js turns into what each player pays.
export const SCORERS = {
  'hong-kong': { score: hongKong, points: (faan) => 2 ** faan, selfDraw: 1.5, dealerDouble: false, specials: true, unit: 'faan' },
  taiwanese: { score: taiwanese, points: (tai) => tai, selfDraw: 1, dealerDouble: true, specials: false, unit: 'tai' },
  riichi: { score: riichi, pays: riichiPays, specials: true, unit: 'han' },
}
