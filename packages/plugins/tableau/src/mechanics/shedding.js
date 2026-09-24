import { suitName, rankName } from '../cards.js'

// Shedding: Crazy Eights. "A player must play one card from their hand onto
// the discard pile. A card is legal if it matches the suit of the top discard,
// or matches the rank of the top discard, or is an 8." Playing a wild names
// the suit to follow. "If a player cannot play, they draw from the stock one
// card at a time until they can play or the stock is exhausted. If the stock
// is exhausted and they still cannot play, they pass." The first player out
// wins.
//
//     game: shedding
//     wild: 8                 # a rank that is always playable and names the suit
//     starterSkips: 8         # a starter of this rank is buried and the next turned
//
// A wild's suit is part of the move - `{ cards: [id], suit: hearts }` - so
// which suit was named is a choice made with the card, not a second turn.

function settings(ctx) {
  const c = ctx.config
  return {
    wild: c.wild !== undefined ? rankName(c.wild) : null,
    skip: c.starterSkips !== undefined ? rankName(c.starterSkips) : null,
  }
}

function suitsOf(ctx) {
  return [...new Set(ctx.deck.map(card => card.suit))]
}

export const shedding = {
  init(base, ctx) {
    const s = settings(ctx)
    const hands = base.hands
    const stock = [...base.drawPile]
    // "Top card is turned face-up to start the discard pile. If it is an 8,
    // bury it and reveal the next card."
    let at = 0
    while (s.skip && at < stock.length - 1 && ctx.card(stock[at]).rank === s.skip) at++
    const starter = stock[at]
    // Buried: what was skipped goes under the rest of the stock.
    const drawPile = [...stock.slice(at + 1), ...stock.slice(0, at)]
    return { ...base, hands, drawPile, discard: [starter], suit: ctx.card(starter).suit, passes: 0, finished: null, next: null }
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    const top = ctx.card(slice.discard[slice.discard.length - 1])
    const out = []
    for (const id of slice.hands[seat]) {
      const card = ctx.card(id)
      if (s.wild && card.rank === s.wild) {
        for (const suit of suitsOf(ctx)) out.push({ action: 'play', cards: [id], suit })
      } else if (card.suit === slice.suit || card.rank === top.rank) {
        out.push({ action: 'play', cards: [id] })
      }
    }
    if (out.length) return out
    return slice.drawPile.length ? [{ action: 'draw' }] : [{ action: 'pass' }]
  },

  apply(move, slice, seat, ctx) {
    if (move.action === 'draw') {
      const [top, ...rest] = slice.drawPile
      const hands = slice.hands.map((h, i) => (i === seat ? [...h, top] : h))
      // Drawing goes on until a card can be played: the turn stays here.
      return { ...slice, hands, drawPile: rest, passes: 0, next: seat }
    }
    if (move.action === 'pass') {
      const passes = slice.passes + 1
      // Nobody can play and nothing is left to draw: the fewest cards wins.
      if (passes >= ctx.seats) {
        const counts = slice.hands.map(h => h.length)
        const least = Math.min(...counts)
        const winners = counts.map((n, i) => (n === least ? i : -1)).filter(i => i >= 0)
        return { ...slice, passes, finished: winners.length === 1 ? winners[0] : 'draw', next: null }
      }
      return { ...slice, passes, next: null }
    }
    const id = move.cards[0]
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(c => c !== id) : h))
    return {
      ...slice,
      hands,
      discard: [...slice.discard, id],
      suit: move.suit ? suitName(move.suit) : ctx.card(id).suit,
      passes: 0,
      finished: hands[seat].length === 0 ? seat : null,
      next: null,
    }
  },

  winner(slice) {
    return slice.finished
  },

  table(view, ctx) {
    const top = view.discard[view.discard.length - 1]
    const named = ctx.card(top)?.suit !== view.suit ? ` · ${view.suit} named` : ''
    return [{ label: `Discard${named} · stock ${view.drawPile.length}`, cards: [top] }]
  },

  // Hold the wild back; follow with what matches, from the suit held most;
  // name the suit held most.
  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    const hand = view.hands[seat]
    const count = new Map()
    for (const id of hand) {
      const c = ctx.card(id)
      if (c.rank !== s.wild) count.set(c.suit, (count.get(c.suit) || 0) + 1)
    }
    const plays = moves.filter(m => m.action === 'play')
    if (!plays.length) return moves[0]
    const plain = plays.filter(m => !m.suit)
    if (plain.length) return plain.reduce((best, m) => ((count.get(ctx.card(m.cards[0]).suit) || 0) > (count.get(ctx.card(best.cards[0]).suit) || 0) ? m : best))
    const favourite = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return plays.find(m => m.suit === favourite) || plays[0]
  },

  describe(move, ctx) {
    if (move.action !== 'play') return move.action
    const face = ctx.card(move.cards[0])?.display || move.cards[0]
    return move.suit ? `${face}→${move.suit}` : face
  },
}
