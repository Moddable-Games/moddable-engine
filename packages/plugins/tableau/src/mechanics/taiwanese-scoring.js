import { parseKind } from './mahjong-hands.js'

// Taiwanese sixteen-tile mahjong (engine#184), scored as Mahjong Time's
// "Taiwanese Mahjong Scoring" (mahjongtime.com, sections 5.2 to 5.4). The
// only unit is the tai, and a hand is worth the total of its patterns.
//
// Where a pattern "implies" another, the other is not counted as well; where
// it "does not imply" one, both count. Patterns that grade one idea (three,
// four, five concealed triplets; a chow hand, a chow hand with no honours or
// flowers) are a series, and a hand scores only the highest of each.
//
// Seven flowers and seasons robbing the eighth, and all eight, are winning
// hands in themselves: "scores for any other patterns are ignored".

const honour = (p) => !p.suited
const CONCEALED_TRIPLETS = { 2: 2, 3: 5, 4: 15, 5: 40 }

function regular(hand, add, each, found) {
  const pungs = hand.sets.filter(s => s.type !== 'chow')
  const chows = hand.sets.filter(s => s.type === 'chow')
  const kindOf = (s) => parseKind(s.kind)
  const pair = parseKind(hand.pair)
  for (const s of pungs) if (honour(kindOf(s))) each.push(['Pung/Kong of Honors', 1])
  for (const s of pungs) if (s.type === 'kong') each.push(s.open ? ['Melded Kong', 1] : ['Concealed Kong', 2])
  for (const suit of new Set(chows.map(s => kindOf(s).suit))) {
    const straight = [1, 4, 7].map(r => chows.find(c => c.kind === `${suit}_${r}` && !c.open) || chows.find(c => c.kind === `${suit}_${r}`))
    if (straight.every(Boolean)) add('straight', '3 Chows of 1 suit, step 3', straight.every(c => !c.open) ? 10 : 5)
  }
  const concealedPungs = pungs.filter(s => !s.open).length
  if (CONCEALED_TRIPLETS[concealedPungs]) add('triplets', `${['Two', 'Three', 'Four', 'Five'][concealedPungs - 2]} concealed triplets`, CONCEALED_TRIPLETS[concealedPungs])
  const dragons = pungs.filter(s => kindOf(s).suit === 'dragon').length
  if (dragons === 3) add('dragons', 'Three Great Scholars (Big Three Dragons)', 30)
  else if (dragons === 2 && pair.suit === 'dragon') add('dragons', 'Little Three Dragons', 15)
  const winds = pungs.filter(s => kindOf(s).suit === 'wind').length
  const windPair = pair.suit === 'wind'
  if (winds === 4) add('winds', 'Big Four Winds', 40)
  else if (winds === 3 && windPair) add('winds', 'Little Four Winds', 30)
  else if (winds === 3) add('winds', 'Big Three Winds', 15)
  else if (winds === 2 && windPair) add('winds', 'Little Three Winds', 5)
  // Concealed: nothing claimed. Fully concealed implies the self-drawn tile.
  if (hand.concealed && hand.selfDrawn) {
    add('concealed', 'Fully concealed hand', 3)
    found.delete('drawn')
  } else if (hand.concealed) add('concealed', 'Concealed hand', 1)
  // Exposed hand implies both one-chance and out on a pair.
  if (hand.sets.every(s => s.open) && hand.wait === 'pair') add('wait', 'Exposed hand', 10)
  else if (hand.wait === 'pair') add('wait', 'Out on a pair', 1)
  else if (hand.wait === 'edge' || hand.wait === 'closed') add('wait', 'Out on a one-chance Chow', 1)
  if (chows.length === hand.sets.length) {
    // The better chow hand requires, and so implies, no honours and no flowers.
    const plain = !hand.kinds.map(parseKind).some(honour) && !hand.bonus.length
    add('shape', plain ? 'Chow hand with no Honors/Flowers' : 'Chow hand', plain ? 10 : 3)
    if (plain) found.delete('plain')
  }
  if (pungs.length === hand.sets.length) add('shape', 'Pung hand', 10)
}

export function taiwanese(hand, config = {}) {
  if (hand.special === 'all-flowers') return { value: 30, patterns: [['All Flowers and Seasons', 30]], rank: 30 }
  if (hand.special === 'robbing-the-eighth') return { value: 20, patterns: [['Seven Flowers and Seasons, robbing the 8th', 20]], rank: 20 }
  const found = new Map()
  const add = (series, name, tai) => {
    const was = found.get(series)
    if (!was || tai > was[1]) found.set(series, [name, tai])
  }
  const each = []
  const kinds = hand.kinds.map(parseKind)
  const honours = kinds.some(honour)
  const suits = new Set(kinds.filter(k => k.suited).map(k => k.suit))
  add('win', 'Winning', 2)
  for (let i = 0; i < hand.bonus.length; i++) each.push(['Flower or Season', 1])
  if (!honours && !hand.bonus.length) add('plain', 'No Flowers and no Honors', 3)
  else if (!honours) add('plain', 'No Honors', 1)
  else if (!hand.bonus.length) add('plain', 'No Flowers or Seasons', 1)
  if (suits.size === 1) add('suit', honours ? 'One suit and Honors' : 'One suit only', honours ? 10 : 40)
  if (hand.selfDrawn) add('drawn', 'Self-drawn last tile', 1)
  if (hand.lastTile && hand.selfDrawn) add('sea', 'Out on the last tile of the Wall', 1)
  if (hand.lastTile && !hand.selfDrawn) add('river', 'Out of the last discard', 1)
  if (hand.robbing) add('rob', 'Out by robbing a Kong', 1)
  if (hand.discards <= 5) add('early', 'Early winning', 10)
  else if (hand.discards < 10) add('early', 'Early winning', 5)
  if (hand.riichi) add('ready', 'Ready on original hand', 15)
  if (hand.blessing === 'heaven') add('heaven', 'Heavenly Hand', 40)
  if (hand.blessing === 'man' && hand.dealersFirstDiscard) add('earth', 'Earthly Hand', 40)
  if (hand.special === 'half-pairs') add('half', 'Seven pairs and a triplet', 30)
  else regular(hand, add, each, found)
  const patterns = [...found.values(), ...each]
  const total = patterns.reduce((n, [, v]) => n + v, 0)
  const limit = Number(config.limit ?? 0)
  const value = limit ? Math.min(limit, total) : total
  return { value, patterns, rank: value }
}

// Self-drawn, every loser pays the hand; on a discard the discarder alone
// pays it. Where the players agree (section 4, optional): a dealer's bonus on
// any hand the dealer wins or discards into, and a bonus for each deal the
// dealer has continued, 2 tai the first, 4 the second and so on.
export function taiwanesePays(value, { selfDrawn, winnerIsDealer, payerIsDealer, counters = 0, config = {} }) {
  const dealersHand = winnerIsDealer || (payerIsDealer && !selfDrawn)
  if (!dealersHand) return value.value
  return value.value + Number(config.dealerBonus ?? 0) + Number(config.continuedDealBonus ?? 0) * counters
}
