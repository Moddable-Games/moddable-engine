import { createRng } from '../../../../core/index.js'

// Called partner: Schafkopf (engine#184), from Pagat. Four players, eight
// cards each. "Forehand opens the bidding" and each player passes or names a
// game; a game must outrank the one standing, Rufer below Wenz below Solo,
// and "in the case of equality priority is given to the first player".
//
//   Rufer   the declarer "calls a non-trump Ace in a suit in which he or she
//           has at least one card", and its holder is a partner nobody else
//           knows of until it is played. Obers, then Unters, then hearts are
//           trump. "The called Ace must be played to the first trick in which
//           its suit is led", unless its holder runs away by leading the suit
//           with enough cards of it, and it may not be thrown away.
//   Solo    the declarer alone, with a suit of their choice in place of hearts.
//   Wenz    the declarer alone, with the four Unters the only trumps.
//
// The declaring side needs 61 card points; 91 is schneider, all the tricks
// schwarz. A game is worth its tariff, plus schneider and schwarz, plus one
// for each Laufende - consecutive top trumps held by one side - once there
// are enough of them. In a Rufer each loser pays one winner; in a solo game
// the declarer is paid by, or pays, each defender.
//
//     game: called-partner
//     ober: O
//     unter: U
//     suitOrder: [acorns, leaves, hearts, bells]   # among Obers and Unters, highest first
//     trumpSuit: hearts                           # the Rufer's trump suit
//     plainOrder: [7, 8, 9, K, 10, A]             # a trump or plain suit below the courts, low to high
//     wenzOrder: [7, 8, 9, O, K, 10, A]
//     cardPoints: { A: 11, 10: 10, K: 4, O: 3, U: 2 }
//     tariff: { rufer: 1, solo: 5, wenz: 5, schneider: 1, schwarz: 2, laufende: 1 }
//     laufende: { rufer: 3, solo: 3, wenz: 2 }
//     runAway: 4                                  # cards of the called suit needed to run away
//     rounds: 1

const RANK = { rufer: 1, wenz: 2, solo: 3 }

function settings(ctx) {
  const c = ctx.config
  return {
    ober: String(c.ober ?? 'O'),
    unter: String(c.unter ?? 'U'),
    suits: c.suitOrder || ['acorns', 'leaves', 'hearts', 'bells'],
    trumpSuit: c.trumpSuit || 'hearts',
    plain: (c.plainOrder || ['7', '8', '9', 'K', '10', 'A']).map(String),
    wenz: (c.wenzOrder || ['7', '8', '9', 'O', 'K', '10', 'A']).map(String),
    points: c.cardPoints || { A: 11, 10: 10, K: 4, O: 3, U: 2 },
    tariff: { rufer: 1, solo: 5, wenz: 5, schneider: 1, schwarz: 2, laufende: 1, ...(c.tariff || {}) },
    runners: { rufer: 3, solo: 3, wenz: 2, ...(c.laufende || {}) },
    runAway: Number(c.runAway ?? 4),
    rounds: Number(c.rounds ?? 1) || 1,
  }
}

const pointsOf = (ids, ctx) => ids.reduce((n, id) => n + Number(settings(ctx).points[ctx.card(id).rank] || 0), 0)

function isTrump(id, game, ctx) {
  const s = settings(ctx)
  const card = ctx.card(id)
  if (game.type === 'wenz') return card.rank === s.unter
  if (card.rank === s.ober || card.rank === s.unter) return true
  return card.suit === (game.type === 'solo' ? game.suit : s.trumpSuit)
}

const suitIn = (id, game, ctx) => (isTrump(id, game, ctx) ? 'trump' : ctx.card(id).suit)

function strengthIn(id, game, ctx) {
  const s = settings(ctx)
  const card = ctx.card(id)
  const rankIndex = s.suits.indexOf(card.suit)
  if (game.type === 'wenz') return card.rank === s.unter ? 100 - rankIndex : s.wenz.indexOf(card.rank)
  if (card.rank === s.ober) return 200 - rankIndex
  if (card.rank === s.unter) return 100 - rankIndex
  return s.plain.indexOf(card.rank)
}

function trickWinner(trick, game, ctx) {
  const led = suitIn(trick[0].card, game, ctx)
  let best = trick[0]
  for (const play of trick.slice(1)) {
    const a = suitIn(play.card, game, ctx), b = suitIn(best.card, game, ctx)
    if (a === b && strengthIn(play.card, game, ctx) > strengthIn(best.card, game, ctx)) best = play
    else if (a === 'trump' && b !== 'trump') best = play
    else if (a === led && b !== led && b !== 'trump') best = play
  }
  return best.seat
}

// The trumps of a game from the top, for counting Laufende.
function trumpsFromTop(game, ctx) {
  return ctx.deck.map(c => c.id).filter(id => isTrump(id, game, ctx)).sort((a, b) => strengthIn(b, game, ctx) - strengthIn(a, game, ctx))
}

function deal(slice, handNo, ctx) {
  const dealer = handNo % 4
  const pool = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const hands = [[], [], [], []]
  // "Four at a time in two rounds", beginning with forehand.
  for (let round = 0; round < 2; round++) for (let k = 1; k <= 4; k++) hands[(dealer + k) % 4].push(...pool.splice(0, 4))
  const forehand = (dealer + 1) % 4
  return {
    ...slice,
    hand: handNo,
    dealer,
    hands,
    drawPile: [],
    phase: 'bid',
    spoken: 0,
    best: null,
    game: null,
    declarer: null,
    partner: null,
    revealed: false,
    ranAway: false,
    trick: [],
    lastTrick: null,
    tricks: [0, 0, 0, 0],
    taken: [[], [], [], []],
    held: null,
    next: forehand,
  }
}

function nextHand(slice, ctx) {
  const handNo = slice.hand + 1
  if (handNo >= settings(ctx).rounds * 4) {
    const top = Math.max(...slice.scores)
    const leaders = slice.scores.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0)
    return { ...slice, phase: 'over', finished: leaders.length === 1 ? leaders[0] : 'draw', next: null }
  }
  return deal(slice, handNo, ctx)
}

// The games a seat may announce: anything above the one standing.
function offers(slice, seat, ctx) {
  const s = settings(ctx)
  const hand = slice.hands[seat]
  const out = [{ action: 'pass' }]
  const standing = slice.best ? RANK[slice.best.type] : 0
  if (standing < RANK.rufer) {
    for (const suit of s.suits) {
      if (suit === s.trumpSuit) continue
      const plain = { type: 'rufer' }
      const holds = hand.filter(id => !isTrump(id, plain, ctx) && ctx.card(id).suit === suit)
      if (holds.length && !holds.some(id => ctx.card(id).rank === 'A')) out.push({ action: 'call', value: suit })
    }
  }
  if (standing < RANK.wenz) out.push({ action: 'wenz' })
  if (standing < RANK.solo) for (const suit of s.suits) out.push({ action: 'solo', value: suit })
  return out
}

function calledAce(game) {
  return game.type === 'rufer' ? `${game.called}_A` : null
}

function settle(slice, ctx) {
  const s = settings(ctx)
  const game = slice.game
  const side = game.type === 'rufer' ? [slice.declarer, slice.partner] : [slice.declarer]
  const points = side.reduce((n, seat) => n + pointsOf(slice.taken[seat], ctx), 0)
  const tricks = side.reduce((n, seat) => n + slice.tricks[seat], 0)
  const won = points >= 61
  let value = s.tariff[game.type]
  const loserPoints = won ? 120 - points : points
  const loserTricks = won ? 8 - tricks : tricks
  if (loserPoints <= 30) value += s.tariff.schneider
  if (loserTricks === 0) value += s.tariff.schwarz
  // Laufende: consecutive top trumps held by one side, counted from the top.
  const order = trumpsFromTop(game, ctx)
  const holder = (id) => slice.held.findIndex(h => h.includes(id))
  const onSide = (seat) => side.includes(seat)
  const firstSide = onSide(holder(order[0]))
  let run = 0
  for (const id of order) { if (onSide(holder(id)) === firstSide) run++; else break }
  if (run >= s.runners[game.type]) value += run * s.tariff.laufende
  const scores = [...slice.scores]
  const sign = won ? 1 : -1
  if (game.type === 'rufer') {
    for (let seat = 0; seat < 4; seat++) scores[seat] += (onSide(seat) ? sign : -sign) * value
  } else {
    for (let seat = 0; seat < 4; seat++) scores[seat] += seat === slice.declarer ? sign * value * 3 : -sign * value
  }
  const lastHand = { game, declarer: slice.declarer, partner: slice.partner, points, won, value }
  return nextHand({ ...slice, scores, lastHand }, ctx)
}

export const calledPartner = {
  init(base, ctx) {
    return deal({ seed: ctx.seed || 1, scores: [0, 0, 0, 0], finished: null, next: null }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.phase === 'bid') return offers(slice, seat, ctx)
    if (slice.phase !== 'play') return []
    const game = slice.game
    const hand = slice.hands[seat]
    const ace = calledAce(game)
    const holdsAce = ace && hand.includes(ace)
    const lastTrick = hand.length === 1
    if (!slice.trick.length) {
      if (!holdsAce || slice.ranAway) return hand.map(id => ({ action: 'play', cards: [id] }))
      // Leading the called suit means leading the ace, unless the holder has
      // enough of the suit to run away.
      const suitCards = hand.filter(id => suitIn(id, game, ctx) === game.called)
      return hand.filter(id => id === ace || suitIn(id, game, ctx) !== game.called || suitCards.length >= s.runAway)
        .map(id => ({ action: 'play', cards: [id] }))
    }
    const led = suitIn(slice.trick[0].card, game, ctx)
    let options = hand.filter(id => suitIn(id, game, ctx) === led)
    // The called ace goes to the first trick its suit is led to.
    if (holdsAce && led === game.called && !slice.ranAway) options = [ace]
    if (!options.length) options = holdsAce && !lastTrick && !slice.ranAway ? hand.filter(id => id !== ace) : hand
    if (!options.length) options = hand
    return options.map(id => ({ action: 'play', cards: [id] }))
  },

  apply(move, slice, seat, ctx) {
    if (slice.phase === 'bid') {
      const spoken = slice.spoken + 1
      let best = slice.best
      if (move.action !== 'pass') {
        best = move.action === 'call'
          ? { type: 'rufer', called: move.value, seat }
          : { type: move.action, suit: move.value || null, seat }
      }
      if (spoken < 4) return { ...slice, spoken, best, next: (seat + 1) % 4 }
      // "If all pass, the cards are thrown in and the next dealer deals afresh."
      if (!best) return nextHand({ ...slice, lastHand: { thrownIn: true } }, ctx)
      const game = { type: best.type, suit: best.suit, called: best.called }
      const ace = calledAce(game)
      const partner = ace ? slice.hands.findIndex(h => h.includes(ace)) : null
      return { ...slice, phase: 'play', spoken, best, game, declarer: best.seat, partner, held: slice.hands.map(h => [...h]), next: (slice.dealer + 1) % 4 }
    }
    const id = move.cards[0]
    const game = slice.game
    const ace = calledAce(game)
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(c => c !== id) : h))
    const trick = [...slice.trick, { seat, card: id }]
    // Leading the called suit without its ace is running away.
    const ranAway = slice.ranAway || (!slice.trick.length && ace && slice.hands[seat].includes(ace) && id !== ace && suitIn(id, game, ctx) === game.called)
    const revealed = slice.revealed || id === ace
    if (trick.length < 4) return { ...slice, hands, trick, ranAway, revealed, next: (seat + 1) % 4 }
    const winner = trickWinner(trick, game, ctx)
    const after = {
      ...slice,
      hands,
      trick: [],
      ranAway,
      revealed,
      lastTrick: { plays: trick, winner },
      tricks: slice.tricks.map((n, i) => (i === winner ? n + 1 : n)),
      taken: slice.taken.map((t, i) => (i === winner ? [...t, ...trick.map(p => p.card)] : t)),
      next: winner,
    }
    return hands.every(h => !h.length) ? settle(after, ctx) : after
  },

  winner(slice) {
    return slice.finished
  },

  // Nobody learns who holds the called ace until it is played, except its holder.
  project(slice, seat) {
    const knowsPartner = slice.revealed || seat === slice.partner
    return {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))),
      partner: knowsPartner ? slice.partner : null,
      held: null,
    }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    if (view.phase === 'bid') {
      const b = view.best
      groups.push({ label: b ? `${name(b.seat)} would play ${b.type === 'rufer' ? `a Rufer with the ace of ${b.called}` : b.type === 'solo' ? `a ${b.suit} Solo` : 'a Wenz'}` : 'Nobody has named a game yet', cards: [] })
    } else if (view.game) {
      const g = view.game
      const what = g.type === 'rufer' ? `a Rufer, calling the ace of ${g.called}` : g.type === 'solo' ? `a ${g.suit} Solo` : 'a Wenz'
      const partner = g.type === 'rufer' ? (view.partner !== null ? ` with ${name(view.partner)}` : ', partner unknown') : ''
      groups.push({ label: `${name(view.declarer)} plays ${what}${partner}`, cards: [] })
    }
    if (view.trick.length) groups.push({ label: `Led by ${name(view.trick[0].seat)}`, cards: view.trick.map(p => p.card) })
    else if (view.lastTrick) groups.push({ label: `Last trick to ${name(view.lastTrick.winner)}`, cards: view.lastTrick.plays.map(p => p.card) })
    return groups
  },

  describeSeat(view, seat, ctx) {
    const parts = [`score ${view.scores[seat]}`]
    if (seat === view.declarer) parts.push('declarer')
    if (view.phase === 'play') parts.push(`${view.tricks[seat]} tricks`)
    parts.push(`hand ${view.hand + 1} of ${settings(ctx).rounds * 4}`)
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return `A tie on ${Math.max(...slice.scores)}`
    return `${shown[slice.finished]} wins with ${slice.scores[slice.finished]}`
  },

  // Name a Rufer with four trumps or more, a Solo with six; lead trumps as
  // the declaring side; win what is worth winning; give points to a partner.
  policy(view, seat, moves, ctx) {
    const hand = view.hands[seat]
    const pick = (action, value) => moves.find(m => m.action === action && (value === undefined || m.value === value))
    if (view.phase === 'bid') {
      const trumpsFor = (game) => hand.filter(id => isTrump(id, game, ctx)).length
      const solo = moves.filter(m => m.action === 'solo').find(m => trumpsFor({ type: 'solo', suit: m.value }) >= 6)
      if (solo) return solo
      const call = moves.find(m => m.action === 'call')
      if (call && trumpsFor({ type: 'rufer' }) >= 4) return call
      return pick('pass')
    }
    const game = view.game
    const points = (id) => Number(settings(ctx).points[ctx.card(id).rank] || 0)
    const options = moves.map(m => m.cards[0])
    const play = (id) => moves.find(m => m.cards[0] === id)
    const strength = (id) => (isTrump(id, game, ctx) ? 1000 : 0) + strengthIn(id, game, ctx)
    const mySide = (other) => other === seat || (view.declarer === seat && other === view.partner) || (view.partner === seat && other === view.declarer)
    if (!view.trick.length) return play([...options].sort((a, b) => strength(b) - strength(a))[0])
    const current = trickWinner(view.trick, game, ctx)
    if (mySide(current) && current !== seat) return play([...options].sort((a, b) => points(b) - points(a))[0])
    const wins = options.filter(id => trickWinner([...view.trick, { seat, card: id }], game, ctx) === seat)
    if (wins.length) return play(wins.sort((a, b) => strength(a) - strength(b))[0])
    return play([...options].sort((a, b) => points(a) - points(b))[0])
  },

  describe(move, ctx) {
    if (move.action === 'call') return `calls the ace of ${move.value}`
    if (move.action === 'solo') return `plays a ${move.value} Solo`
    if (move.action === 'wenz') return 'plays a Wenz'
    if (move.action === 'play') return move.cards.map(id => ctx.card(id)?.display || id).join(' ')
    return move.action
  },
}
