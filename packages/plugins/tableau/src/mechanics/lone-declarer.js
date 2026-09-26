import { createRng } from '../../../../core/index.js'

// Lone declarer: Skat (engine#184). Three players; the auction is in game
// values, and whoever bids highest plays alone against the other two, with
// the two-card skat. From Pagat and the page:
//
//   - "M speaks first, either passing or bidding a number"; F says yes or
//     passes; then R bids against the survivor. "If both M and R pass without
//     having bid, then F can either be declarer at the lowest bid (18), or
//     can throw in the cards without play."
//   - The declarer picks up the skat and discards two, or plays Hand and may
//     announce schneider, schwarz or ouvert.
//   - A suit game or grand: the four jacks are the top trumps, then the
//     trump suit A, 10, K, Q, 9, 8, 7. Null: no trumps, and each suit ranks
//     "A - K - Q - J - 10 - 9 - 8 - 7"; the declarer must take no trick.
//   - The value is the base times matadors + 1 for the game, + 1 each for
//     hand, schneider, schneider announced, schwarz, schwarz announced and
//     ouvert. A game won scores its value; lost, twice its value. A game
//     worth less than the bid is lost, at "twice the least multiple of the
//     base value ... which would have fulfilled the bid".
//
//     game: lone-declarer
//     jack: U                                   # the rank that is always trump
//     jackOrder: [acorns, leaves, hearts, bells] # highest first
//     suitBase: { acorns: 12, leaves: 11, hearts: 10, bells: 9 }
//     grandBase: 24
//     nullValues: { plain: 23, hand: 35, ouvert: 46, handOuvert: 59 }
//     rankOrder: [7, 8, 9, O, K, 10, A]         # a trump or plain suit, low to high
//     nullOrder: [7, 8, 9, 10, U, O, K, A]
//     cardPoints: { A: 11, 10: 10, K: 4, O: 3, U: 2 }
//     rounds: 1                                  # each player deals this many times

const BIDS = (() => {
  const out = new Set()
  const bases = [9, 10, 11, 12, 24]
  for (const base of bases) for (let m = 2; m <= 18; m++) out.add(base * m)
  for (const v of [23, 35, 46, 59]) out.add(v)
  return [...out].filter(v => v >= 18).sort((a, b) => a - b)
})()

function settings(ctx) {
  const c = ctx.config
  return {
    jack: String(c.jack ?? 'U'),
    jackOrder: c.jackOrder || ['acorns', 'leaves', 'hearts', 'bells'],
    suitBase: c.suitBase || { acorns: 12, leaves: 11, hearts: 10, bells: 9 },
    grandBase: Number(c.grandBase ?? 24),
    nullValues: { plain: 23, hand: 35, ouvert: 46, handOuvert: 59, ...(c.nullValues || {}) },
    order: (c.rankOrder || ['7', '8', '9', 'O', 'K', '10', 'A']).map(String),
    nullOrder: (c.nullOrder || ['7', '8', '9', '10', 'U', 'O', 'K', 'A']).map(String),
    points: c.cardPoints || { A: 11, 10: 10, K: 4, O: 3, U: 2 },
    rounds: Number(c.rounds ?? 1) || 1,
  }
}

const pointsOf = (ids, ctx) => ids.reduce((n, id) => n + Number(settings(ctx).points[ctx.card(id).rank] || 0), 0)

// A card's suit and strength in the game being played.
function suitIn(id, game, ctx) {
  const s = settings(ctx)
  const card = ctx.card(id)
  if (!game || game.type === 'null') return card.suit
  if (card.rank === s.jack) return 'trump'
  return game.type === 'suit' && card.suit === game.suit ? 'trump' : card.suit
}

function strengthIn(id, game, ctx) {
  const s = settings(ctx)
  const card = ctx.card(id)
  if (game.type === 'null') return s.nullOrder.indexOf(card.rank)
  if (card.rank === s.jack) return 100 - s.jackOrder.indexOf(card.suit)
  return s.order.indexOf(card.rank)
}

function trickWinner(trick, game, ctx) {
  const led = suitIn(trick[0].card, game, ctx)
  let best = trick[0]
  for (const play of trick.slice(1)) {
    const a = suitIn(play.card, game, ctx), b = suitIn(best.card, game, ctx)
    if (a === b && strengthIn(play.card, game, ctx) > strengthIn(best.card, game, ctx)) best = play
    else if (a === 'trump' && b !== 'trump') best = play
    else if (a !== b && b !== 'trump' && b !== led && a === led) best = play
  }
  return best.seat
}

function baseOf(game, s) {
  return game.type === 'grand' ? s.grandBase : s.suitBase[game.suit]
}

// "With" or "without" so many jacks, counted down from the highest, as the
// page's matador table does, from one to four.
function matadors(cards, ctx) {
  const s = settings(ctx)
  const has = (suit) => cards.some(id => ctx.card(id).rank === s.jack && ctx.card(id).suit === suit)
  const first = has(s.jackOrder[0])
  let n = 0
  for (const suit of s.jackOrder) { if (has(suit) === first) n++; else break }
  return n
}

function nullValue(game, s) {
  if (game.hand && game.ouvert) return s.nullValues.handOuvert
  if (game.ouvert) return s.nullValues.ouvert
  if (game.hand) return s.nullValues.hand
  return s.nullValues.plain
}

// The game's value when played, from the cards the declarer held.
function gameValue(game, declarerCards, result, ctx) {
  const s = settings(ctx)
  if (game.type === 'null') return nullValue(game, s)
  let m = matadors(declarerCards, ctx) + 1
  if (game.hand) m++
  if (result.schneider) m++
  if (game.schneider) m++
  if (result.schwarz) m++
  if (game.schwarz) m++
  if (game.ouvert) m++
  return baseOf(game, s) * m
}

function deal(slice, handNo, ctx) {
  const dealer = handNo % 3
  const pool = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const hands = [[], [], []]
  const order = [1, 2, 0].map(k => (dealer + k) % 3)
  // "3 cards each, 2 to the skat, 4 each, 3 each."
  for (const n of [3]) for (const p of order) hands[p].push(...pool.splice(0, n))
  const skat = pool.splice(0, 2)
  for (const n of [4, 3]) for (const p of order) hands[p].push(...pool.splice(0, n))
  const F = (dealer + 1) % 3, M = (dealer + 2) % 3
  return {
    ...slice,
    hand: handNo,
    dealer,
    hands,
    skat,
    drawPile: [],
    phase: 'bid',
    auction: { stage: 1, bidder: M, listener: F, value: 0, speaker: M, out: [] },
    declarer: null,
    bid: 0,
    game: null,
    trick: [],
    lastTrick: null,
    tricks: [0, 0, 0],
    taken: [[], [], []],
    held: null,
    next: M,
  }
}

function nextBids(value) {
  return BIDS.filter(v => v > value).slice(0, 10)
}

function becomeDeclarer(slice, seat, value) {
  return { ...slice, phase: 'skat', declarer: seat, bid: value, next: seat }
}

function throwIn(slice, ctx) {
  return nextHand({ ...slice, lastHand: { thrownIn: true } }, ctx)
}

function nextHand(slice, ctx) {
  const s = settings(ctx)
  const handNo = slice.hand + 1
  if (handNo >= s.rounds * 3) {
    const top = Math.max(...slice.scores)
    const leaders = slice.scores.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0)
    return { ...slice, phase: 'over', finished: leaders.length === 1 ? leaders[0] : 'draw', next: null }
  }
  return deal(slice, handNo, ctx)
}

function settle(slice, ctx, nullTaken = false) {
  const s = settings(ctx)
  const d = slice.declarer
  const game = slice.game
  const declarerPoints = pointsOf([...slice.taken[d], ...slice.skat], ctx)
  const defenderTricks = slice.tricks.reduce((n, t, i) => (i === d ? n : n + t), 0)
  let won, value
  if (game.type === 'null') {
    won = !nullTaken && slice.tricks[d] === 0
    value = nullValue(game, s)
  } else {
    const result = {
      schneider: declarerPoints >= 90 || declarerPoints <= 30,
      schwarz: defenderTricks === 0 || slice.tricks[d] === 0,
    }
    value = gameValue(game, slice.held, result, ctx)
    won = declarerPoints >= 61
      && (!game.schneider || declarerPoints >= 90)
      && (!game.schwarz || defenderTricks === 0)
    if (value < slice.bid) {
      won = false
      const base = baseOf(game, s)
      value = Math.ceil(slice.bid / base) * base
    }
  }
  const delta = won ? value : -2 * value
  const scores = slice.scores.map((v, i) => (i === d ? v + delta : v))
  const lastHand = { declarer: d, game, points: declarerPoints, won, delta }
  return nextHand({ ...slice, scores, lastHand }, ctx)
}

export const loneDeclarer = {
  init(base, ctx) {
    return deal({ seed: ctx.seed || 1, scores: [0, 0, 0], finished: null, next: null }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.phase === 'bid') {
      const a = slice.auction
      if (a.stage === 3) return [{ action: 'bid', value: '18' }, { action: 'pass' }]
      if (seat === a.bidder && a.speaker === a.bidder) return [...nextBids(a.value).map(v => ({ action: 'bid', value: String(v) })), { action: 'pass' }]
      return [{ action: 'yes' }, { action: 'pass' }]
    }
    if (slice.phase === 'skat') return [{ action: 'pick' }, { action: 'hand' }]
    if (slice.phase === 'discard') {
      const hand = slice.hands[seat]
      const out = []
      for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) out.push({ action: 'discard', cards: [hand[i], hand[j]] })
      return out
    }
    if (slice.phase === 'declare') {
      const suits = Object.keys(s.suitBase)
      const out = []
      const extras = slice.handGame ? ['', ' schneider', ' schwarz', ' ouvert'] : ['']
      for (const suit of [...suits, 'grand']) for (const x of extras) out.push({ action: 'declare', value: `${suit}${x}` })
      out.push({ action: 'declare', value: 'null' }, { action: 'declare', value: 'null ouvert' })
      return out
    }
    if (slice.phase !== 'play') return []
    const hand = slice.hands[seat]
    if (!slice.trick.length) return hand.map(id => ({ action: 'play', cards: [id] }))
    const led = suitIn(slice.trick[0].card, slice.game, ctx)
    const follow = hand.filter(id => suitIn(id, slice.game, ctx) === led)
    return (follow.length ? follow : hand).map(id => ({ action: 'play', cards: [id] }))
  },

  apply(move, slice, seat, ctx) {
    if (slice.phase === 'bid') return bidMove(move, slice, seat, ctx)
    if (move.action === 'pick') {
      return { ...slice, phase: 'discard', handGame: false, hands: slice.hands.map((h, i) => (i === seat ? [...h, ...slice.skat] : h)), skat: [] }
    }
    if (move.action === 'hand') return { ...slice, phase: 'declare', handGame: true }
    if (move.action === 'discard') {
      return { ...slice, phase: 'declare', skat: move.cards, hands: slice.hands.map((h, i) => (i === seat ? h.filter(id => !move.cards.includes(id)) : h)) }
    }
    if (move.action === 'declare') {
      const [kind, extra] = String(move.value).split(' ')
      const game = kind === 'null'
        ? { type: 'null', hand: !!slice.handGame, ouvert: extra === 'ouvert' }
        : {
            type: kind === 'grand' ? 'grand' : 'suit',
            suit: kind === 'grand' ? null : kind,
            hand: !!slice.handGame,
            schneider: extra === 'schneider' || extra === 'schwarz' || extra === 'ouvert',
            schwarz: extra === 'schwarz' || extra === 'ouvert',
            ouvert: extra === 'ouvert',
          }
      // The matadors are counted in the declarer's cards and the skat.
      const held = [...slice.hands[seat], ...slice.skat]
      return { ...slice, phase: 'play', game, held, next: (slice.dealer + 1) % 3 }
    }

    const id = move.cards[0]
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(c => c !== id) : h))
    const trick = [...slice.trick, { seat, card: id }]
    if (trick.length < 3) return { ...slice, hands, trick, next: (seat + 1) % 3 }
    const winner = trickWinner(trick, slice.game, ctx)
    const tricks = slice.tricks.map((n, i) => (i === winner ? n + 1 : n))
    const taken = slice.taken.map((t, i) => (i === winner ? [...t, ...trick.map(p => p.card)] : t))
    const after = { ...slice, hands, trick: [], lastTrick: { plays: trick, winner }, tricks, taken, next: winner }
    // A null declarer who takes a trick has lost at once.
    if (slice.game.type === 'null' && winner === slice.declarer) return settle(after, ctx, true)
    if (hands.every(h => !h.length)) return settle(after, ctx)
    return after
  },

  winner(slice) {
    return slice.finished
  },

  // Each hand is private, and the skat too; an ouvert declarer's hand is open.
  project(slice, seat) {
    const open = slice.game && slice.game.ouvert
    return {
      ...slice,
      viewer: seat,
      hands: slice.hands.map((h, i) => (i === seat || (open && i === slice.declarer) ? h : h.map(() => null))),
      skat: slice.skat.map(id => (seat === slice.declarer && slice.phase !== 'bid' && slice.phase !== 'skat' ? id : null)),
      held: null,
    }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    if (view.phase === 'bid') {
      const a = view.auction
      groups.push({ label: a.stage === 3 ? `${name(a.bidder)} may play at 18 or throw in` : `${name(a.bidder)} bids to ${name(a.listener)} · ${a.value || 'no bid yet'}`, cards: [] })
    } else if (view.declarer !== null) {
      const g = view.game
      const what = g ? (g.type === 'null' ? `null${g.ouvert ? ' ouvert' : ''}` : `${g.type === 'grand' ? 'grand' : g.suit}${g.hand ? ' hand' : ''}${g.schwarz ? ' schwarz' : g.schneider ? ' schneider' : ''}${g.ouvert ? ' ouvert' : ''}`) : 'choosing a game'
      groups.push({ label: `${name(view.declarer)} declares at ${view.bid}: ${what}`, cards: view.skat.filter(id => id !== null) })
    }
    if (view.trick.length) groups.push({ label: `Led by ${name(view.trick[0].seat)}`, cards: view.trick.map(p => p.card) })
    else if (view.lastTrick) groups.push({ label: `Last trick to ${name(view.lastTrick.winner)}`, cards: view.lastTrick.plays.map(p => p.card) })
    if (view.game?.ouvert && view.viewer !== view.declarer) groups.push({ label: `${name(view.declarer)}'s open hand`, cards: view.hands[view.declarer] })
    return groups
  },

  describeSeat(view, seat, ctx) {
    const parts = [`score ${view.scores[seat]}`]
    if (seat === view.declarer) parts.push('declarer')
    if (view.phase === 'play') parts.push(`${view.tricks[seat]} tricks`)
    parts.push(`hand ${view.hand + 1} of ${settings(ctx).rounds * 3}`)
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return `A tie on ${Math.max(...slice.scores)}`
    return `${shown[slice.finished]} wins with ${slice.scores[slice.finished]}`
  },

  policy(view, seat, moves, ctx) {
    return lonePolicy(view, seat, moves, ctx)
  },

  describe(move, ctx) {
    if (move.action === 'bid') return `bids ${move.value}`
    if (move.action === 'discard') return 'discards two'
    if (move.action === 'declare') return `declares ${move.value}`
    if (move.action === 'pick') return 'picks up the skat'
    if (move.action === 'hand') return 'plays hand'
    if (move.action === 'play') return move.cards.map(id => ctx.card(id)?.display || id).join(' ')
    return move.action
  },
}

function bidMove(move, slice, seat, ctx) {
  const a = { ...slice.auction }
  if (a.stage === 3) {
    return move.action === 'bid' ? becomeDeclarer(slice, seat, 18) : throwIn(slice, ctx)
  }
  if (move.action === 'bid') {
    return { ...slice, auction: { ...a, value: Number(move.value), speaker: a.listener }, next: a.listener }
  }
  if (move.action === 'yes') return { ...slice, auction: { ...a, speaker: a.bidder }, next: a.bidder }
  // A pass: the passer is out, and the other survives this stage.
  const survivor = seat === a.bidder ? a.listener : a.bidder
  const out = [...a.out, seat]
  if (a.stage === 1) {
    const R = slice.dealer
    return { ...slice, auction: { stage: 2, bidder: R, listener: survivor, value: a.value, speaker: R, out }, next: R }
  }
  if (a.value > 0) return becomeDeclarer(slice, survivor, a.value)
  // Nobody bid: forehand may play at 18 or throw the cards in.
  const F = (slice.dealer + 1) % 3
  return { ...slice, auction: { ...a, stage: 3, bidder: F, listener: F, out }, next: F }
}

// A computer seat's Skat: bid while the hand is worth it, pick up the skat
// and bury the cheapest cards, name the longest suit, and in play win what
// is worth winning and smear points to a partner who is winning.
function lonePolicy(view, seat, moves, ctx) {
  const s = settings(ctx)
  const hand = view.hands[seat]
  const card = (id) => ctx.card(id)
  const pick = (action, value) => moves.find(m => m.action === action && (value === undefined || m.value === value))
  const jacks = hand.filter(id => card(id).rank === s.jack)
  const bySuit = new Map()
  for (const id of hand) if (card(id).rank !== s.jack) bySuit.set(card(id).suit, (bySuit.get(card(id).suit) || 0) + 1)
  const best = [...bySuit.entries()].sort((a, b) => b[1] - a[1] || s.suitBase[b[0]] - s.suitBase[a[0]])[0]
  const limit = () => {
    if (jacks.length + (best ? best[1] : 0) < 6) return 0
    return s.suitBase[best[0]] * (matadors(hand, ctx) + 1)
  }
  if (view.phase === 'bid') {
    const a = view.auction
    if (a.stage === 3) return limit() >= 18 ? pick('bid') : pick('pass')
    if (pick('yes')) return a.value <= limit() ? pick('yes') : pick('pass')
    const next = moves.find(m => m.action === 'bid')
    return next && Number(next.value) <= limit() ? next : pick('pass')
  }
  if (view.phase === 'skat') return pick('pick')
  if (view.phase === 'discard') {
    const cost = (id) => (card(id).rank === s.jack ? 100 : Number(s.points[card(id).rank] || 0) * -1 + (card(id).suit === (best && best[0]) ? 50 : 0))
    return moves.reduce((a, b) => (cost(b.cards[0]) + cost(b.cards[1]) > cost(a.cards[0]) + cost(a.cards[1]) ? b : a))
  }
  if (view.phase === 'declare') {
    const suits = Object.keys(s.suitBase)
    const counts = suits.map(suit => [suit, hand.filter(id => card(id).suit === suit && card(id).rank !== s.jack).length])
    counts.sort((a, b) => b[1] - a[1] || s.suitBase[b[0]] - s.suitBase[a[0]])
    const value = (suit) => s.suitBase[suit] * (matadors([...hand, ...view.skat.filter(Boolean)], ctx) + 1 + (view.handGame ? 1 : 0))
    const fits = counts.find(([suit]) => value(suit) >= view.bid)
    if (fits) return pick('declare', fits[0])
    return pick('declare', 'grand') || moves[0]
  }
  // Play.
  const game = view.game
  const points = (id) => Number(s.points[card(id).rank] || 0)
  const byStrength = (a, b) => strengthIn(a, game, ctx) - strengthIn(b, game, ctx)
  const options = moves.map(m => m.cards[0])
  const play = (id) => moves.find(m => m.cards[0] === id)
  if (!view.trick.length) return play([...options].sort((a, b) => strengthIn(b, game, ctx) - strengthIn(a, game, ctx))[0])
  const wins = options.filter(id => trickWinner([...view.trick, { seat, card: id }], game, ctx) === seat)
  const current = trickWinner(view.trick, game, ctx)
  const partnerWinning = seat !== view.declarer && current !== view.declarer
  if (game.type === 'null') {
    const losing = options.filter(id => !wins.includes(id))
    if (seat === view.declarer) return play((losing.length ? losing : options).sort(byStrength).reverse()[0])
    return play(options.sort(byStrength)[0])
  }
  if (partnerWinning) return play(options.sort((a, b) => points(b) - points(a))[0])
  if (wins.length) return play(wins.sort(byStrength)[0])
  return play(options.sort((a, b) => points(a) - points(b) || byStrength(a, b))[0])
}
