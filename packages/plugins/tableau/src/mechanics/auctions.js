// The auctions that decide a trick-taking hand before it is played
// (engine#184), and how each is scored. Two kinds, named by
// `auction:` in a game's frontmatter:
//
//   order-up   Euchre, from its page: "each player may order up (tell the
//              dealer to take the upcard, making its suit trump) or pass". If
//              all pass, "each player may name any suit (except the suit of the
//              turned-down upcard) as trump or pass. The dealer must name trump
//              if all others pass." Whoever makes trump may go alone.
//   contract   Bridge: "a bid names a number (1-7) and a strain", "players may
//              bid ..., pass, double ... or redouble", and "three consecutive
//              passes end the auction". "The first player on the contracting
//              partnership who named the strain of the final contract becomes
//              the declarer", and their partner is the dummy.

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']
const SYMBOL = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }
const STRAINS = ['♣', '♦', '♥', '♠', 'NT']
const STRAIN_SUIT = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades', NT: null }
const RED = new Set(['hearts', 'diamonds'])

const partnerOf = (seat, seats) => (seat + seats / 2) % seats

// --- order-up -----------------------------------------------------------

export function orderUpDeal(slice, dealer, ctx) {
  const upcard = slice.drawPile[0]
  return { ...slice, phase: 'order', round: 1, passes: 0, upcard, maker: null, alone: false, out: null, trump: null, next: (dealer + 1) % ctx.seats }
}

export function orderUpMoves(slice, seat, ctx) {
  const alone = !!ctx.config.goingAlone
  if (slice.phase === 'dealer-discard') return slice.hands[seat].map(id => ({ action: 'discard', cards: [id] }))
  const out = []
  if (slice.round === 1) {
    // "If the dealer's partner orders the card up, he/she must play alone."
    const partnerOfDealer = seat === partnerOf(slice.dealer, ctx.seats)
    if (!partnerOfDealer) out.push({ action: 'order' })
    if (alone || partnerOfDealer) out.push({ action: 'order', value: 'alone' })
  } else {
    const turned = ctx.card(slice.upcard).suit
    for (const suit of SUITS) {
      if (suit === turned) continue
      out.push({ action: 'call', value: suit })
      if (alone) out.push({ action: 'call', value: `${suit} alone` })
    }
  }
  // "The dealer must name trump if all others pass."
  const stuck = slice.round === 2 && seat === slice.dealer
  if (!stuck) out.push({ action: 'pass' })
  return out
}

// A move in the auction; returns the slice ready to play when trump is made.
export function orderUpApply(move, slice, seat, ctx, startPlay) {
  const seats = ctx.seats
  if (move.action === 'discard') {
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(id => id !== move.cards[0]) : h))
    return startPlay({ ...slice, hands })
  }
  if (move.action === 'pass') {
    const passes = slice.passes + 1
    if (passes < seats) return { ...slice, passes, next: (seat + 1) % seats }
    // Round one passed out: the upcard is turned down and suits are named.
    return { ...slice, round: 2, passes: 0, next: (slice.dealer + 1) % seats }
  }
  const alone = String(move.value || '').endsWith('alone')
  const out = alone ? partnerOf(seat, seats) : null
  // "If one player is playing alone, the person to that player's left leads first."
  const leader = alone ? (seat + 1) % seats : null
  if (move.action === 'order') {
    const trump = ctx.card(slice.upcard).suit
    const made = { ...slice, trump, maker: seat, alone, out, leader }
    // The dealer takes the upcard and discards, unless sitting out.
    if (out === slice.dealer) return startPlay(made)
    const hands = made.hands.map((h, i) => (i === slice.dealer ? [...h, slice.upcard] : h))
    return { ...made, hands, phase: 'dealer-discard', next: slice.dealer }
  }
  const suit = String(move.value).split(' ')[0]
  return startPlay({ ...slice, trump: suit, maker: seat, alone, out, leader })
}

// The bowers: "the Jack of trump suit" is the highest trump and "the Jack of
// the same-color suit" the second, and it "belongs to the trump suit for all
// purposes".
export function bowerSuit(card, trump) {
  if (!trump || card.rank !== 'J') return card.suit
  if (card.suit === trump) return trump
  return RED.has(card.suit) === RED.has(trump) ? trump : card.suit
}

export function bowerRank(card, trump, plain) {
  if (!trump || card.rank !== 'J') return plain
  if (card.suit === trump) return 100
  return RED.has(card.suit) === RED.has(trump) ? 99 : plain
}

// "Makers win 3 or 4 tricks: 1 point. Makers win all 5 tricks: 2 points ...
// go alone and win all 5 tricks: 4 points. Makers win fewer than 3 tricks
// (Euchre): Opponents score 2 points."
export function scoreMakers(slice, teams) {
  const makerTeam = teams.findIndex(t => t.includes(slice.maker))
  const tricks = teams[makerTeam].reduce((n, seat) => n + slice.won[seat], 0)
  const delta = Array(teams.length).fill(0)
  if (tricks >= 5) delta[makerTeam] = slice.alone ? 4 : 2
  else if (tricks >= 3) delta[makerTeam] = 1
  else delta[1 - makerTeam] = 2
  return delta
}

// --- contract -------------------------------------------------------------

export function contractDeal(slice, dealer) {
  return { ...slice, phase: 'auction', calls: [], contract: null, declarer: null, dummy: null, trump: null, next: dealer }
}

const bidIndex = (bid) => (Number(bid[0]) - 1) * 5 + STRAINS.indexOf(bid.slice(1))

function lastBid(calls) {
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i].call !== 'pass' && calls[i].call !== 'double' && calls[i].call !== 'redouble') return { ...calls[i], at: i }
  return null
}

export function contractMoves(slice, seat) {
  const calls = slice.calls
  const out = [{ action: 'pass' }]
  const bid = lastBid(calls)
  const from = bid ? bidIndex(bid.call) + 1 : 0
  for (let i = from; i < 35; i++) out.push({ action: 'bid', value: `${Math.floor(i / 5) + 1}${STRAINS[i % 5]}` })
  const lastReal = [...calls].reverse().find(c => c.call !== 'pass')
  const opponent = (s) => (s % 2) !== (seat % 2)
  if (lastReal && opponent(lastReal.seat) && lastReal.call !== 'double' && lastReal.call !== 'redouble') out.push({ action: 'double' })
  if (lastReal && opponent(lastReal.seat) && lastReal.call === 'double') out.push({ action: 'redouble' })
  return out
}

export function contractApply(move, slice, seat, ctx, startPlay, redeal) {
  const seats = ctx.seats
  const call = move.action === 'bid' ? move.value : move.action
  const calls = [...slice.calls, { seat, call }]
  const bid = lastBid(calls)
  const trailing = (() => { let n = 0; for (let i = calls.length - 1; i >= 0 && calls[i].call === 'pass'; i--) n++; return n })()
  if (!bid && trailing >= seats) return redeal()
  if (bid && trailing >= 3) {
    const strain = bid.call.slice(1)
    const side = bid.seat % 2
    const declarer = calls.find(c => c.seat % 2 === side && c.call !== 'pass' && c.call !== 'double' && c.call !== 'redouble' && c.call.slice(1) === strain).seat
    const after = calls.slice(bid.at + 1).filter(c => c.call !== 'pass').map(c => c.call)
    const doubled = after.includes('redouble') ? 4 : after.includes('double') ? 2 : 1
    const contract = { level: Number(bid.call[0]), strain, doubled, declarer, side }
    return startPlay({ ...slice, calls, contract, declarer, dummy: partnerOf(declarer, seats), trump: STRAIN_SUIT[strain], leader: (declarer + 1) % seats })
  }
  return { ...slice, calls, next: (seat + 1) % seats }
}

const trickValue = (strain, n) => (n <= 0 ? 0 : strain === 'NT' ? 40 + 30 * (n - 1) : (strain === '♣' || strain === '♦' ? 20 : 30) * n)
const overtrickValue = (strain) => (strain === '♣' || strain === '♦' ? 20 : 30)

// Rubber bridge, as the page and Pagat score it. Returns the new rubber
// state and whether it is over.
export function scoreRubber(slice, teams) {
  const c = slice.contract
  const rubber = { below: [...slice.rubber.below], above: [...slice.rubber.above], games: [...slice.rubber.games] }
  const side = c.side
  const vul = rubber.games[side] > 0
  const tricks = teams[side].reduce((n, seat) => n + slice.won[seat], 0)
  const need = 6 + c.level
  if (tricks >= need) {
    rubber.below[side] += trickValue(c.strain, c.level) * c.doubled
    const over = tricks - need
    if (c.doubled === 1) rubber.above[side] += over * overtrickValue(c.strain)
    else rubber.above[side] += over * (c.doubled === 2 ? (vul ? 200 : 100) : (vul ? 400 : 200))
    if (c.doubled === 2) rubber.above[side] += 50
    if (c.doubled === 4) rubber.above[side] += 100
    if (c.level === 6) rubber.above[side] += vul ? 750 : 500
    if (c.level === 7) rubber.above[side] += vul ? 1500 : 1000
  } else {
    const down = need - tricks
    let penalty = 0
    for (let k = 1; k <= down; k++) {
      if (c.doubled === 1) penalty += vul ? 100 : 50
      else {
        const doubled = vul ? (k === 1 ? 200 : 300) : (k === 1 ? 100 : k <= 3 ? 200 : 300)
        penalty += doubled * (c.doubled === 4 ? 2 : 1)
      }
    }
    rubber.above[1 - side] += penalty
  }
  // A game is 100 below the line; it closes the game for both sides.
  let over = false
  if (rubber.below[side] >= 100) {
    rubber.games[side] += 1
    rubber.above = rubber.above.map((v, i) => v + rubber.below[i])
    rubber.below = [0, 0]
    if (rubber.games[side] >= 2) {
      rubber.above[side] += rubber.games[1 - side] === 0 ? 700 : 500
      over = true
    }
  }
  return { rubber, over }
}

export function suitLabel(suit) {
  return suit ? `${SYMBOL[suit] || ''} ${suit}` : 'no trump'
}

