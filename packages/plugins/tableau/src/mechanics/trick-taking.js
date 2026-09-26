import { deal } from '../../../../component-deck/index.js'
import { createRng } from '../../../../core/index.js'
import { ordering, cardIdOf, suitName } from '../cards.js'
import {
  orderUpDeal, orderUpMoves, orderUpApply, bowerSuit, bowerRank, scoreMakers,
  contractDeal, contractMoves, contractApply, scoreRubber, suitLabel,
} from './auctions.js'

// Trick-taking: Whist, Hearts, Spades. "Each player must follow suit if
// possible. If unable to follow suit, a player may play any card. The highest
// card of the led suit wins the trick unless a trump is played", and "the
// winner of each trick leads the next". Hands are dealt and scored until a
// score reaches the target.
//
// What separates one of these games from another is data:
//
//     game: trick-taking
//     rankOrder: [2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A]   # low to high
//     trump: last-card        # none | a suit | last-card: the dealer's last card, turned
//     leadsWith: 2-clubs      # the first trick of a hand opens with this card
//     breaking: hearts        # may not be led until played off-suit, unless nothing else is held
//     firstTrickForbids: [hearts, Q-spades]   # not discarded to the first trick while anything else is held
//     passing: { count: 3, cycle: [left, right, across, none] }
//     bidding: { min: 0, max: 13, nil: true }  # a bid of 0 is nil
//     partnerships: [[north, south], [east, west]]
//     scoring:
//       type: over-book | penalty | contract
//       book: 6                                # over-book: a point a trick above it
//       points: { hearts: 1, Q-spades: 13 }    # penalty: what a card taken in a trick costs
//       moon: 26                               # penalty: taking every point card
//       perTrick: 10, bagLimit: 10, bagPenalty: 100, nil: 100   # contract
//     target: 100             # the game ends on a hand that takes a score here
//     auction: order-up | contract   # trump or a contract decided before play (auctions.js)
//     bowers: true            # the Jacks of the trump colour rank above the Ace, both as trumps
//     goingAlone: true        # a maker may play without their partner
//     scoring: { type: makers | rubber }
//
// The dealer rotates each hand; the player to the dealer's left is dealt to
// first, passes first, bids first and, unless `leadsWith` says otherwise, leads.

const DIRECTIONS = { left: 1, right: -1, across: 2 }

function settings(ctx) {
  const c = ctx.config
  const names = ctx.names
  const seatOf = (name) => (typeof name === 'number' ? name : names.indexOf(name))
  const teams = (c.partnerships || []).map(team => team.map(seatOf))
  const scoring = c.scoring || { type: 'over-book', book: 6 }
  const penalties = new Map()
  // A key naming a card - `Q-spades` - is that card; any other is a suit.
  for (const [key, pts] of Object.entries(scoring.points || {})) penalties.set(key.includes('-') ? cardIdOf(key) : suitName(key), pts)
  return {
    teams,
    teamOf: (seat) => { const i = teams.findIndex(t => t.includes(seat)); return i >= 0 ? i : seat },
    sides: teams.length ? teams.length : ctx.seats,
    scoring,
    penaltyOf: (id) => {
      const card = ctx.card(id)
      if (!card) return 0
      if (penalties.has(id)) return penalties.get(id)
      return penalties.get(card.suit) || 0
    },
    forbidden: new Set((c.firstTrickForbids || []).map(k => (k.includes('-') ? cardIdOf(k) : suitName(k)))),
    breaking: c.breaking ? suitName(c.breaking) : null,
    leadsWith: c.leadsWith ? cardIdOf(c.leadsWith) : null,
    passing: c.passing || null,
    bidding: c.bidding || null,
    target: c.target ?? null,
    lowWins: scoring.type === 'penalty',
    auction: c.auction || null,
    bowers: !!c.bowers,
  }
}

// A card's suit and rank in play, once trump is known: the bowers change both.
function suitIn(ctx, id, trump) {
  const card = ctx.card(id)
  return ctx.config.bowers ? bowerSuit(card, trump) : card.suit
}

function rankIn(ctx, id, trump) {
  const { rankOf } = ordering(ctx.config)
  const card = ctx.card(id)
  return ctx.config.bowers ? bowerRank(card, trump, rankOf(card)) : rankOf(card)
}

// The seats taking part in a hand: a lone maker's partner sits out.
function inPlay(slice, ctx) {
  return ctx.seats - (slice.out === null || slice.out === undefined ? 0 : 1)
}

function nextIn(slice, seat, ctx) {
  let next = (seat + 1) % ctx.seats
  if (next === slice.out) next = (next + 1) % ctx.seats
  return next
}

// Play begins once an auction is settled.
function startPlay(slice, ctx) {
  const left = slice.leader ?? (slice.dealer + 1) % ctx.seats
  const lead = left === slice.out ? (left + 1) % ctx.seats : left
  return { ...slice, phase: 'play', trick: [], trickNo: 0, next: lead }
}

// A hand dealt from the seed: the dealer's left is dealt to first, so the last
// card of an even deal falls to the dealer, and that is the card Whist turns.
function dealHand(slice, handNo, ctx) {
  const s = settings(ctx)
  const seats = ctx.seats
  const dealer = (seats - 1 + handNo) % seats
  const ids = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const dealt = deal(ids, { ...(ctx.config.deal || {}), players: seats })
  const hands = Array.from({ length: seats }, () => [])
  dealt.hands.forEach((hand, p) => { hands[(dealer + 1 + p) % seats] = hand })
  let trump = null, trumpCard = null
  const t = ctx.config.trump
  if (t === 'last-card') {
    const last = dealt.hands.map(h => h[h.length - 1])[seats - 1]
    trumpCard = last
    trump = ctx.card(last)?.suit || null
  } else if (t && t !== 'none') {
    trump = suitName(t)
  }

  const left = (dealer + 1) % seats
  const direction = s.passing ? (s.passing.cycle || ['left'])[handNo % (s.passing.cycle || ['left']).length] : 'none'
  const phase = direction !== 'none' && s.passing ? 'pass' : (s.bidding ? 'bid' : 'play')
  const next = phase === 'play' ? leaderOf(hands, left, s) : left
  const fresh = {
    ...slice,
    hands,
    community: [],
    drawPile: dealt.drawPile || [],
    hand: handNo,
    dealer,
    trump,
    trumpCard,
    phase,
    direction,
    gives: Array(seats).fill(null),
    bids: Array(seats).fill(null),
    trick: [],
    lastTrick: null,
    trickNo: 0,
    broken: false,
    won: Array(seats).fill(0),
    taken: Array(seats).fill(0),
    out: null,
    leader: null,
    next,
  }
  if (s.auction === 'order-up') return orderUpDeal(fresh, dealer, ctx)
  if (s.auction === 'contract') return contractDeal(fresh, dealer)
  return fresh
}

function leaderOf(hands, fallback, s) {
  if (!s.leadsWith) return fallback
  const holder = hands.findIndex(h => h.includes(s.leadsWith))
  return holder >= 0 ? holder : fallback
}

function choose(list, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) { out.push(prefix); return out }
  for (let i = start; i <= list.length - (k - prefix.length); i++) choose(list, k, i + 1, [...prefix, list[i]], out)
  return out
}

function playable(slice, seat, ctx) {
  const s = settings(ctx)
  const hand = slice.hands[seat]
  const suitOf = (id) => suitIn(ctx, id, slice.trump)
  if (!slice.trick.length) {
    // The first trick of a hand may have to open with a named card.
    if (slice.trickNo === 0 && s.leadsWith && hand.includes(s.leadsWith)) return [s.leadsWith]
    if (s.breaking && !slice.broken) {
      const others = hand.filter(id => suitOf(id) !== s.breaking)
      if (others.length) return others
    }
    return hand
  }
  const led = suitOf(slice.trick[0].card)
  const following = hand.filter(id => suitOf(id) === led)
  if (following.length) return following
  if (slice.trickNo === 0 && s.forbidden.size) {
    const allowed = hand.filter(id => !s.forbidden.has(id) && !s.forbidden.has(suitOf(id)))
    if (allowed.length) return allowed
  }
  return hand
}

function trickWinner(trick, trump, ctx) {
  const suit = (id) => suitIn(ctx, id, trump)
  const rank = (id) => rankIn(ctx, id, trump)
  const led = suit(trick[0].card)
  let best = trick[0]
  for (const play of trick.slice(1)) {
    const a = suit(play.card), b = suit(best.card)
    const aTrump = trump && a === trump, bTrump = trump && b === trump
    if (aTrump && !bTrump) best = play
    else if (aTrump === bTrump && a === b && rank(play.card) > rank(best.card)) best = play
    else if (!aTrump && !bTrump && a === led && b !== led) best = play
  }
  return best.seat
}

// A hand's score, per side: a partnership when the game has them, else a seat.
function scoreHand(slice, ctx) {
  const s = settings(ctx)
  const sc = s.scoring
  const delta = Array(s.sides).fill(0)
  const bags = [...(slice.bags || Array(s.sides).fill(0))]
  if (sc.type === 'penalty') {
    const moon = sc.moon
    const shooter = moon ? slice.taken.findIndex(t => t === moon) : -1
    if (shooter >= 0) {
      // "The shooter selects which option is more advantageous": add to
      // everyone else unless that would end the game with the shooter not
      // lowest, in which case take it off their own score.
      const addOthers = slice.scores.map((v, i) => (i === shooter ? v : v + moon))
      const ends = s.target !== null && addOthers.some(v => v >= s.target)
      const lowest = Math.min(...addOthers)
      const shooterLowest = addOthers[shooter] === lowest && addOthers.filter(v => v === lowest).length === 1
      if (ends && !shooterLowest) delta[shooter] = -Math.min(moon, slice.scores[shooter])
      else for (let i = 0; i < delta.length; i++) if (i !== shooter) delta[i] = moon
    } else {
      slice.taken.forEach((t, i) => { delta[i] = t })
    }
    return { delta, bags }
  }
  if (sc.type === 'makers') return { delta: scoreMakers(slice, s.teams), bags }
  const tricksOf = (side) => (s.teams.length ? s.teams[side].reduce((n, seat) => n + slice.won[seat], 0) : slice.won[side])
  if (sc.type === 'contract') {
    const per = sc.perTrick ?? 10
    for (let side = 0; side < s.sides; side++) {
      const members = s.teams.length ? s.teams[side] : [side]
      let contract = 0, made = 0
      for (const seat of members) {
        const bid = slice.bids[seat] || 0
        if (bid === 0 && s.bidding?.nil) {
          // Nil: its own bonus or penalty, and its tricks are overtricks.
          delta[side] += slice.won[seat] === 0 ? (sc.nil ?? 100) : -(sc.nil ?? 100)
          bags[side] += slice.won[seat]
        } else {
          contract += bid
          made += slice.won[seat]
        }
      }
      if (made >= contract) {
        delta[side] += contract * per + (made - contract)
        bags[side] += made - contract
      } else {
        delta[side] -= contract * per
      }
      const limit = sc.bagLimit ?? 10
      while (limit > 0 && bags[side] >= limit) {
        bags[side] -= limit
        delta[side] -= sc.bagPenalty ?? 100
      }
    }
    return { delta, bags }
  }
  // over-book
  const book = sc.book ?? 6
  for (let side = 0; side < s.sides; side++) delta[side] = Math.max(0, tricksOf(side) - book)
  return { delta, bags }
}

function gameOver(scores, s) {
  if (s.target === null) return null
  if (!scores.some(v => v >= s.target)) return null
  // The best score wins; a tie for it plays on.
  const best = s.lowWins ? Math.min(...scores) : Math.max(...scores)
  const leaders = scores.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0)
  if (s.lowWins) return leaders.length === 1 ? leaders[0] : null
  const reached = leaders.filter(i => scores[i] >= s.target)
  return reached.length === 1 ? reached[0] : null
}

export const trickTaking = {
  groupsBySuit: true,

  init(base, ctx) {
    const s = settings(ctx)
    const slice = { seed: ctx.seed || 1, scores: Array(s.sides).fill(0), bags: Array(s.sides).fill(0), finished: null, next: null }
    if (s.scoring.type === 'rubber') slice.rubber = { below: [0, 0], above: [0, 0], games: [0, 0] }
    return dealHand(slice, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.phase === 'order' || slice.phase === 'dealer-discard') return orderUpMoves(slice, seat, ctx)
    if (slice.phase === 'auction') return contractMoves(slice, seat)
    if (slice.phase === 'pass') {
      if (slice.gives[seat]) return []
      return choose(slice.hands[seat], s.passing.count || 3).map(cards => ({ action: 'give', cards }))
    }
    if (slice.phase === 'bid') {
      const min = s.bidding.min ?? 0
      const max = s.bidding.max ?? slice.hands[seat].length
      const out = []
      for (let v = min; v <= max; v++) out.push({ action: 'bid', value: v })
      return out
    }
    return playable(slice, seat, ctx).map(id => ({ action: 'play', cards: [id] }))
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    const seats = ctx.seats
    if (slice.phase === 'order' || slice.phase === 'dealer-discard') return orderUpApply(move, slice, seat, ctx, (x) => startPlay(x, ctx))
    if (slice.phase === 'auction') return contractApply(move, slice, seat, ctx, (x) => startPlay(x, ctx), () => dealHand(slice, slice.hand + 1, ctx))
    if (move.action === 'give') {
      const gives = slice.gives.map((g, i) => (i === seat ? move.cards : g))
      if (gives.some(g => g === null)) return { ...slice, gives, next: (seat + 1) % seats }
      // Everyone has chosen: the cards cross the table together.
      const step = DIRECTIONS[slice.direction] || 1
      const hands = slice.hands.map((h, i) => h.filter(id => !gives[i].includes(id)))
      gives.forEach((cards, from) => { hands[((from + step) % seats + seats) % seats].push(...cards) })
      const left = (slice.dealer + 1) % seats
      const phase = s.bidding ? 'bid' : 'play'
      return { ...slice, hands, gives: Array(seats).fill(null), phase, next: phase === 'play' ? leaderOf(hands, left, s) : left }
    }
    if (move.action === 'bid') {
      const bids = slice.bids.map((b, i) => (i === seat ? move.value : b))
      const done = bids.every(b => b !== null)
      const left = (slice.dealer + 1) % seats
      return { ...slice, bids, phase: done ? 'play' : 'bid', next: done ? leaderOf(slice.hands, left, s) : (seat + 1) % seats }
    }

    const id = move.cards[0]
    const card = ctx.card(id)
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(c => c !== id) : h))
    const trick = [...slice.trick, { seat, card: id }]
    const led = ctx.card(trick[0].card).suit
    const broken = slice.broken || (s.breaking && card.suit === s.breaking && (trick.length > 1 ? card.suit !== led : false))
    if (trick.length < inPlay(slice, ctx)) return { ...slice, hands, trick, broken, next: nextIn(slice, seat, ctx) }

    const winner = trickWinner(trick, slice.trump, ctx)
    const won = slice.won.map((n, i) => (i === winner ? n + 1 : n))
    const points = trick.reduce((n, p) => n + s.penaltyOf(p.card), 0)
    const taken = slice.taken.map((n, i) => (i === winner ? n + points : n))
    const after = { ...slice, hands, trick: [], lastTrick: { plays: trick, winner }, trickNo: slice.trickNo + 1, broken, won, taken, next: winner }
    if (hands.some((h, i) => i !== slice.out && h.length)) return after

    if (s.scoring.type === 'rubber') {
      const { rubber, over } = scoreRubber(after, s.teams)
      const scores = rubber.above.map((v, i) => v + rubber.below[i])
      const lastHand = { won, contract: after.contract }
      if (over) {
        const side = scores[0] >= scores[1] ? 0 : 1
        return { ...after, rubber, scores, lastHand, phase: 'over', finished: s.teams[side][0], winningSide: side, next: null }
      }
      return dealHand({ ...after, rubber, scores, lastHand }, after.hand + 1, ctx)
    }

    // The hand is over: score it, and either the game is or the next is dealt.
    const { delta, bags } = scoreHand(after, ctx)
    const scores = after.scores.map((v, i) => v + delta[i])
    const lastHand = { won, taken, bids: after.bids, delta }
    const decided = gameOver(scores, s)
    if (decided !== null) {
      const winnerSeat = s.teams.length ? s.teams[decided][0] : decided
      return { ...after, scores, bags, lastHand, phase: 'over', finished: winnerSeat, winningSide: decided, next: null }
    }
    return { ...dealHand({ ...after, scores, bags, lastHand }, after.hand + 1, ctx) }
  },

  winner(slice) {
    return slice.finished
  },

  // Everyone's own hand and nobody else's, and the cards being passed only to
  // the seat passing them. Tricks are played face up, so what has been taken
  // is known to all.
  // The dummy's hand is laid face up once the opening lead is made.
  project(slice, seat) {
    const dummyShown = slice.dummy !== null && slice.dummy !== undefined && slice.phase === 'play' && (slice.trickNo > 0 || slice.trick.length > 0)
    return {
      ...slice,
      viewer: seat,
      hands: slice.hands.map((h, i) => (i === seat || (dummyShown && i === slice.dummy) ? h : h.map(() => null))),
      drawPile: slice.drawPile.map(() => null),
      gives: slice.gives.map((g, i) => (i === seat || g === null ? g : g.map(() => null))),
    }
  },

  // The declarer plays the dummy's cards.
  actsFor(slice, seat) {
    return slice.phase === 'play' && slice.dummy !== null && slice.dummy !== undefined && seat === slice.dummy ? slice.declarer : null
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    if (view.phase === 'order' && view.round === 1) groups.push({ label: 'Upcard: order it up, or pass', cards: [view.upcard] })
    if (view.phase === 'order' && view.round === 2) groups.push({ label: `Name trump (not ${view.upcard ? ctx.card(view.upcard).suit : ''})`, cards: [] })
    if (view.phase === 'auction') {
      const recent = view.calls.slice(-8).map(c => `${name(c.seat)} ${c.call}`).join(' · ')
      groups.push({ label: recent || `${name(view.next)} to call first`, cards: [] })
    }
    if (view.contract) {
      const c = view.contract
      groups.push({ label: `Contract ${c.level}${c.strain}${c.doubled === 4 ? ' redoubled' : c.doubled === 2 ? ' doubled' : ''} by ${name(c.declarer)}`, cards: [] })
    }
    if (view.dummy !== null && view.dummy !== undefined && view.hands[view.dummy].every(id => id !== null) && view.viewer !== view.dummy) {
      groups.push({ label: `Dummy · ${name(view.dummy)}`, cards: view.hands[view.dummy], selectable: view.viewer === view.declarer && view.next === view.dummy })
    }
    if (view.maker !== null && view.maker !== undefined && view.trump) groups.push({ label: `${name(view.maker)} made ${suitLabel(view.trump)}${view.alone ? ', alone' : ''}`, cards: [] })
    if (view.trumpCard && view.trickNo === 0 && !view.trick.length) groups.push({ label: `Trump: ${view.trump} (turned)`, cards: [view.trumpCard] })
    if (view.trick.length) {
      groups.push({ label: `${view.trump ? `Trump ${view.trump} · ` : ''}Led by ${name(view.trick[0].seat)}`, cards: view.trick.map(p => p.card) })
    } else if (view.lastTrick) {
      groups.push({ label: `Last trick to ${name(view.lastTrick.winner)}`, cards: view.lastTrick.plays.map(p => p.card) })
    }
    return groups
  },

  result(slice, ctx) {
    if (slice.finished === null) return null
    const s = settings(ctx)
    const shown = ctx.displayNames || ctx.names
    const side = slice.winningSide
    const who = s.teams.length ? s.teams[side].map(i => shown[i]).join(' & ') : shown[side]
    const verb = s.teams.length ? 'win' : 'wins'
    return `${who} ${verb}, ${slice.scores.join('–')}`
  },

  // One line per side for the page: score, and this hand's tricks or bid.
  describeSeat(view, seat, ctx) {
    const s = settings(ctx)
    const side = s.teamOf(seat)
    if (view.out === seat) return `sitting out · score ${view.scores[side]}`
    const parts = [`${view.won[seat]} tricks`]
    if (view.rubber) {
      parts.push(`games ${view.rubber.games[side]}`, `below ${view.rubber.below[side]}`, `total ${view.scores[side]}`)
      return parts.join(' · ')
    }
    if (view.bids[seat] !== null && view.bids[seat] !== undefined) parts.push(`bid ${view.bids[seat] === 0 && s.bidding?.nil ? 'nil' : view.bids[seat]}`)
    if (s.scoring.type === 'penalty') parts.push(`${view.taken[seat]} this hand`)
    parts.push(`score ${view.scores[side]}`)
    return parts.join(' · ')
  },

  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    const { rankOf } = ordering(ctx.config)
    const card = (id) => ctx.card(id)
    const hand = view.hands[seat]
    if (view.phase === 'order' || view.phase === 'dealer-discard' || view.phase === 'auction') return auctionPolicy(view, seat, moves, ctx)
    if (view.phase === 'pass') {
      // Pass what is most likely to take points or tricks the seat does not want.
      const danger = (id) => s.penaltyOf(id) * 20 + rankOf(card(id))
      const worst = [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, s.passing.count || 3).sort().join(',')
      return moves.find(m => [...m.cards].sort().join(',') === worst) || null
    }
    if (view.phase === 'bid') {
      const suits = new Map()
      for (const id of hand) suits.set(card(id).suit, (suits.get(card(id).suit) || 0) + 1)
      const top = ordering(ctx.config).ranks.length - 1
      let est = 0
      for (const id of hand) {
        const c = card(id), r = rankOf(c), n = suits.get(c.suit)
        if (r === top) est += 1
        else if (r === top - 1 && n >= 2) est += 0.8
        else if (r === top - 2 && n >= 3) est += 0.4
      }
      if (view.trump) est += Math.max(0, (suits.get(view.trump) || 0) - 3)
      const bid = Math.max(1, Math.round(est))
      return moves.find(m => m.value === bid) || moves[moves.length - 1]
    }

    const options = moves.map(m => m.cards[0])
    const byRank = (a, b) => rankOf(card(a)) - rankOf(card(b))
    const lowest = (ids) => [...ids].sort(byRank)[0]
    const highest = (ids) => [...ids].sort(byRank).reverse()[0]
    const play = (id) => moves.find(m => m.cards[0] === id)
    const avoid = s.scoring.type === 'penalty' || (view.bids[seat] === 0 && s.bidding?.nil)

    if (!view.trick.length) {
      if (avoid) return play(lowest(options))
      const nonTrump = options.filter(id => card(id).suit !== view.trump)
      return play(highest(nonTrump.length ? nonTrump : options))
    }
    const winning = (ids) => ids.filter(id => trickWinner([...view.trick, { seat, card: id }], view.trump, ctx) === seat)
    const winners = winning(options)
    const losers = options.filter(id => !winners.includes(id))
    if (avoid) {
      if (losers.length) {
        // Rid the hand of what costs most while it is safe to.
        const costly = [...losers].sort((a, b) => s.penaltyOf(b) - s.penaltyOf(a) || byRank(b, a))
        return play(costly[0])
      }
      return play(highest(winners))
    }
    const current = trickWinner(view.trick, view.trump, ctx)
    const partnerWinning = s.teams.length && s.teamOf(current) === s.teamOf(seat)
    if (partnerWinning || !winners.length) return play(lowest(losers.length ? losers : options))
    return play(lowest(winners))
  },

  describe(move, ctx) {
    if (move.action === 'discard') return 'discards'
    if (move.action === 'order') return move.value ? 'orders up, alone' : 'orders up'
    if (move.action === 'call') return `calls ${move.value}`
    if (move.action === 'double' || move.action === 'redouble' || move.action === 'pass') return move.action
    if (move.action === 'bid') return `bid ${move.value}`
    if (move.action === 'give') return `passes ${move.cards.length}`
    return move.cards.map(id => ctx.card(id)?.display || id).join(' ')
  },
}

// How a computer seat bids. Euchre: order up or name a suit holding three
// trumps (counting the bowers), and discard the weakest card. Bridge: open
// the longest suit with 13 high-card points, raise a partner's suit with
// support, bid game when the side has 26 between them, and never double.
const HCP = { A: 4, K: 3, Q: 2, J: 1 }
const GAME_LEVEL = { '♣': 5, '♦': 5, '♥': 4, '♠': 4, NT: 3 }
const STRAIN_OF = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }

function auctionPolicy(view, seat, moves, ctx) {
  const hand = view.hands[seat]
  const pick = (action, value) => moves.find(m => m.action === action && (value === undefined || m.value === value))
  if (view.phase === 'dealer-discard') {
    const worth = (id) => (suitIn(ctx, id, view.trump) === view.trump ? 1000 : 0) + rankIn(ctx, id, view.trump)
    return moves.reduce((a, b) => (worth(b.cards[0]) < worth(a.cards[0]) ? b : a))
  }
  if (view.phase === 'order') {
    const trumps = (suit) => hand.filter(id => suitIn(ctx, id, suit) === suit).length
    if (view.round === 1) {
      const suit = ctx.card(view.upcard).suit
      const count = trumps(suit) + (seat === view.dealer ? 1 : 0)
      return count >= 3 ? pick('order') : (pick('pass') || pick('order'))
    }
    const options = moves.filter(m => m.action === 'call' && !String(m.value).includes('alone'))
    const best = options.reduce((a, b) => (trumps(b.value) > trumps(a.value) ? b : a), options[0])
    return trumps(best.value) >= 3 ? best : (pick('pass') || best)
  }
  // Bridge.
  const points = hand.reduce((n, id) => n + (HCP[ctx.card(id).rank] || 0), 0)
  const bySuit = new Map()
  for (const id of hand) bySuit.set(ctx.card(id).suit, (bySuit.get(ctx.card(id).suit) || 0) + 1)
  const longest = [...bySuit.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const partner = (seat + 2) % 4
  const partnerBid = [...view.calls].reverse().find(c => c.seat === partner && /^[1-7]/.test(c.call))
  const mine = view.calls.some(c => c.seat === seat && /^[1-7]/.test(c.call))
  const cheapest = (strain, atMost) => {
    for (let level = 1; level <= atMost; level++) {
      const m = pick('bid', `${level}${strain}`)
      if (m) return m
    }
    return null
  }
  if (partnerBid && points >= 6) {
    const strain = partnerBid.call.slice(1)
    const support = strain === 'NT' ? 2 : (bySuit.get(Object.keys(STRAIN_OF).find(k => STRAIN_OF[k] === strain)) || 0)
    if (support >= 3 || strain === 'NT') {
      const target = points + 13 >= 26 ? GAME_LEVEL[strain] : Number(partnerBid.call[0]) + 1
      const raise = cheapest(strain, target)
      if (raise && Number(raise.value[0]) === target) return raise
    }
  }
  if (!mine && !partnerBid && points >= 13) {
    const open = cheapest(STRAIN_OF[longest], 2)
    if (open) return open
  }
  return pick('pass')
}
