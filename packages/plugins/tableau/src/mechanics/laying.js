import { createRng } from '../../../../core/index.js'
import { meldKind, extendsMeld, meldsIn, handValue, describeCards, rankNumber } from './meld-sets.js'

// Laying: Rummy (engine#184). From Pagat: a turn is to draw "the top card of
// the stock or the top card of the discard pile", then optionally to meld and
// to "add cards to groups or sequences previously melded by yourself or
// others", and to discard. "If you began your turn by picking up the top card
// of the discard pile you are not allowed to end that turn by discarding the
// same card." A player who melds or lays off their last card goes out. "The
// total value of all the cards in the hands of the other players is added to
// the winner's cumulative score", doubled for "going rummy": going out in one
// turn without having melded before. When the stock runs out "the discard
// pile is turned over, without shuffling, to form a new stock".
//
//     game: laying
//     dealByPlayers: { 2: 10, 3: 7, 4: 7, 5: 6, 6: 6 }
//     rummyDoubles: true
//     target: 100

function cardsEach(ctx) {
  const table = ctx.config.dealByPlayers || {}
  for (let n = ctx.seats; n >= 1; n--) if (table[n] !== undefined) return Number(table[n])
  return 7
}

function dealHand(slice, handNo, ctx) {
  const seats = ctx.seats
  const dealer = (seats - 1 + handNo) % seats
  const pool = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const each = cardsEach(ctx)
  const hands = Array.from({ length: seats }, () => [])
  for (let k = 0; k < each; k++) for (let p = 1; p <= seats; p++) hands[(dealer + p) % seats].push(pool.shift())
  const discard = [pool.shift()]
  return {
    ...slice,
    hand: handNo,
    dealer,
    hands,
    drawPile: pool,
    discard,
    melds: [],
    recycled: 0,
    hasMelded: Array(seats).fill(false),
    phase: 'draw',
    fromDiscard: null,
    cleanTurn: false,
    next: (dealer + 1) % seats,
  }
}

function endHand(slice, winner, ctx) {
  const others = slice.hands.reduce((n, h, i) => (i === winner ? n : n + handValue(h, ctx)), 0)
  const rummy = ctx.config.rummyDoubles && slice.cleanTurn
  const gain = rummy ? others * 2 : others
  const scores = slice.scores.map((v, i) => (i === winner ? v + gain : v))
  const lastHand = { winner, gain, rummy }
  const target = Number(ctx.config.target ?? 100)
  const top = Math.max(...scores)
  const leaders = scores.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0)
  if (top >= target && leaders.length === 1) return { ...slice, scores, lastHand, phase: 'over', finished: leaders[0], next: null }
  return dealHand({ ...slice, scores, lastHand }, slice.hand + 1, ctx)
}

export const laying = {
  init(base, ctx) {
    return dealHand({ seed: ctx.seed || 1, scores: Array(ctx.seats).fill(0), finished: null, next: null }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const hand = slice.hands[seat]
    if (slice.phase === 'draw') {
      const out = [{ action: 'draw' }]
      if (slice.discard.length) out.push({ action: 'take' })
      return out
    }
    const out = meldsIn(hand, ctx).map(cards => ({ action: 'meld', cards }))
    for (const id of hand) {
      slice.melds.forEach((meld, i) => {
        if (extendsMeld(meld.cards, id, ctx)) out.push({ action: 'lay off', cards: [id], meld: i, label: `onto ${describeCards(meld.cards, ctx)}` })
      })
      if (id !== slice.fromDiscard) out.push({ action: 'discard', cards: [id] })
    }
    return out
  },

  apply(move, slice, seat, ctx) {
    const seats = ctx.seats
    if (move.action === 'draw') {
      let pile = slice.drawPile
      let discard = slice.discard
      // The stock is spent: the discard pile turns over, in order, as the stock.
      let recycled = slice.recycled || 0
      if (!pile.length) { pile = [...discard]; discard = []; recycled++ }
      const [top, ...rest] = pile
      return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? [...h, top] : h)), drawPile: rest, discard, recycled, phase: 'play', fromDiscard: null, cleanTurn: !slice.hasMelded[seat], next: seat }
    }
    if (move.action === 'take') {
      const top = slice.discard[slice.discard.length - 1]
      return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? [...h, top] : h)), discard: slice.discard.slice(0, -1), phase: 'play', fromDiscard: top, cleanTurn: !slice.hasMelded[seat], next: seat }
    }

    const hand = slice.hands[seat].filter(id => !move.cards.includes(id))
    const hands = slice.hands.map((h, i) => (i === seat ? hand : h))
    if (move.action === 'discard') {
      const after = { ...slice, hands, discard: [...slice.discard, move.cards[0]] }
      if (!hand.length) return endHand(after, seat, ctx)
      return { ...after, phase: 'draw', fromDiscard: null, next: (seat + 1) % seats }
    }
    let melds = slice.melds
    if (move.action === 'meld') melds = [...melds, { cards: move.cards, kind: meldKind(move.cards, ctx), by: seat }]
    else melds = melds.map((m, i) => (i === move.meld ? { ...m, cards: [...m.cards, move.cards[0]] } : m))
    const after = { ...slice, hands, melds, hasMelded: slice.hasMelded.map((v, i) => (i === seat ? true : v)), next: seat }
    return hand.length ? after : endHand(after, seat, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  project(slice, seat) {
    return {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))),
      drawPile: slice.drawPile.map(() => null),
    }
  },

  table(view, ctx) {
    const groups = [{ label: `Stock ${view.drawPile.length} · discard`, cards: view.discard.slice(-1), layout: 'pile' }]
    view.melds.forEach(m => groups.push({ label: `${ctx.names[m.by] || `Player ${m.by + 1}`}'s ${m.kind}`, cards: sortRun(m.cards, ctx) }))
    return groups
  },

  describeSeat(view, seat) {
    return `score ${view.scores[seat]}`
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    return `${shown[slice.finished]} wins with ${slice.scores[slice.finished]}`
  },

  // Take the discard only if it melds; lay down every meld and lay off every
  // card that fits; discard the costliest card left.
  policy(view, seat, moves, ctx, random) {
    if (view.phase === 'draw') {
      const take = moves.find(m => m.action === 'take')
      const top = view.discard[view.discard.length - 1]
      if (take && meldsIn([...view.hands[seat], top], ctx).some(m => m.includes(top))) return take
      return moves.find(m => m.action === 'draw')
    }
    const meld = moves.filter(m => m.action === 'meld').sort((a, b) => b.cards.length - a.cards.length)[0]
    if (meld) return meld
    const layoff = moves.find(m => m.action === 'lay off')
    if (layoff) return layoff
    // Keep what is part of a meld, a pair, or a near run in one suit; throw the
    // loneliest card, the costliest of those.
    const hand = view.hands[seat]
    const ties = (id) => {
      const c = ctx.card(id)
      const r = rankNumber(c)
      return hand.filter(o => o !== id).reduce((n, o) => {
        const d = ctx.card(o)
        if (rankNumber(d) === r) return n + 2
        return d.suit === c.suit && Math.abs(rankNumber(d) - r) <= 2 ? n + 1 : n
      }, 0)
    }
    const discards = moves.filter(m => m.action === 'discard')
    // A stock turned over without shuffling brings the same cards round in
    // the same order, and a table of computer players choosing the same way
    // each time would go round for ever. Once it has turned, vary the discard.
    if (view.recycled && random() < 0.3) return discards[Math.floor(random() * discards.length)] || moves[0]
    const worth = (m) => handValue(m.cards, ctx) - ties(m.cards[0]) * 20
    return discards.reduce((best, m) => (worth(m) > worth(best) ? m : best), discards[0]) || moves[0]
  },

  describe(move, ctx) {
    if (move.action === 'draw') return 'draws'
    if (move.action === 'take') return 'takes the discard'
    if (move.action === 'lay off') return `lays off ${describeCards(move.cards, ctx)}`
    return `${move.action}s ${describeCards(move.cards, ctx)}`
  },
}

function sortRun(ids, ctx) {
  const order = { A: 1, J: 11, Q: 12, K: 13 }
  const n = (id) => order[ctx.card(id).rank] ?? Number(ctx.card(id).rank)
  return [...ids].sort((a, b) => n(a) - n(b))
}
