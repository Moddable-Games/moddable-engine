import { createRng } from '../../../../core/index.js'
import { bestArrangement, extendsMeld, handValue, describeCards } from './meld-sets.js'

// Knocking: Gin Rummy (engine#184). Two players keep their melds in hand.
// "On each turn, a player must draw ... from either the stock or the discard
// pile" and discard, but not the card just taken from the discard pile. A
// player may knock instead "if their deadwood totals 10 points or less",
// laying down their melds; the opponent "lays off any cards from their hand
// onto the knocker's melds". The knocker scores the difference in deadwood, or
// is undercut and the opponent scores it "plus a 25-point undercut bonus".
// Gin - no deadwood at all - scores the opponent's deadwood plus 25, with no
// laying off, and Big Gin, all eleven cards melded, plus 31.
//
// The first upcard is offered to the non-dealer, then the dealer, before
// anyone draws. "If the stock reaches 2 cards and neither player has knocked,
// the hand ends in a draw", dealt again by the same dealer. The game ends when
// a score reaches the target, with a game bonus, a box bonus for every hand
// won, and a shutout bonus.
//
//     game: knocking
//     knock: 10
//     bonuses: { gin: 25, bigGin: 31, undercut: 25, game: 100, box: 25, shutout: 100 }
//     stockFloor: 2
//     target: 100

function settings(ctx) {
  const c = ctx.config
  const b = c.bonuses || {}
  return {
    knock: Number(c.knock ?? 10),
    gin: Number(b.gin ?? 25),
    bigGin: Number(b.bigGin ?? 31),
    undercut: Number(b.undercut ?? 25),
    game: Number(b.game ?? 100),
    box: Number(b.box ?? 25),
    shutout: Number(b.shutout ?? 100),
    floor: Number(c.stockFloor ?? 2),
    target: Number(c.target ?? 100),
    each: Number(c.cardsEach ?? 10),
  }
}

function dealHand(slice, handNo, dealer, ctx) {
  const s = settings(ctx)
  const pool = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const hands = [[], []]
  for (let k = 0; k < s.each; k++) for (const p of [1 - dealer, dealer]) hands[p].push(pool.shift())
  const discard = [pool.shift()]
  return {
    ...slice,
    hand: handNo,
    dealer,
    hands,
    drawPile: pool,
    discard,
    phase: 'upcard',
    passes: 0,
    fromDiscard: null,
    shown: null,
    next: 1 - dealer,
  }
}

// Lay the opponent's deadwood off onto the knocker's melds while any fits.
function layOff(deadwood, melds, ctx) {
  const grown = melds.map(m => [...m])
  let left = [...deadwood]
  let moved = true
  while (moved) {
    moved = false
    for (const id of left) {
      const target = grown.find(m => extendsMeld(m, id, ctx))
      if (target) { target.push(id); left = left.filter(x => x !== id); moved = true; break }
    }
  }
  return { left, melds: grown }
}

function score(slice, knocker, kind, ctx) {
  const s = settings(ctx)
  const other = 1 - knocker
  const mine = bestArrangement(slice.hands[knocker], ctx)
  const theirs = bestArrangement(slice.hands[other], ctx)
  let winner, points, laid = theirs.deadwood
  if (kind === 'gin' || kind === 'big gin') {
    winner = knocker
    points = theirs.value + (kind === 'gin' ? s.gin : s.bigGin)
  } else {
    const off = layOff(theirs.deadwood, mine.melds, ctx)
    laid = off.left
    const theirValue = handValue(laid, ctx)
    if (mine.value < theirValue) { winner = knocker; points = theirValue - mine.value } else { winner = other; points = mine.value - theirValue + s.undercut }
  }
  const scores = slice.scores.map((v, i) => (i === winner ? v + points : v))
  const boxes = slice.boxes.map((v, i) => (i === winner ? v + 1 : v))
  const shown = { knocker, kind, melds: mine.melds, deadwood: mine.deadwood, theirDeadwood: laid, winner, points }
  if (scores[winner] >= s.target) {
    const totals = scores.map((v, i) => v + boxes[i] * s.box + (i === winner ? s.game + (scores[1 - i] === 0 ? s.shutout : 0) : 0))
    const best = totals[0] === totals[1] ? winner : (totals[0] > totals[1] ? 0 : 1)
    return { ...slice, scores, boxes, totals, shown, phase: 'over', finished: best, next: null }
  }
  // The winner of a hand deals the next.
  return dealHand({ ...slice, scores, boxes, shown }, slice.hand + 1, winner, ctx)
}

export const knocking = {
  init(base, ctx) {
    return dealHand({ seed: ctx.seed || 1, scores: [0, 0], boxes: [0, 0], finished: null, next: null }, 0, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.phase === 'upcard') return [{ action: 'take' }, { action: 'pass' }]
    if (slice.phase === 'draw') {
      const out = [{ action: 'draw' }]
      if (slice.discard.length && !slice.noTake) out.push({ action: 'take' })
      return out
    }
    const hand = slice.hands[seat]
    const out = []
    if (bestArrangement(hand, ctx).value === 0) out.push({ action: 'big gin' })
    for (const id of hand) {
      if (id === slice.fromDiscard) continue
      out.push({ action: 'discard', cards: [id] })
      const left = bestArrangement(hand.filter(x => x !== id), ctx).value
      if (left === 0) out.push({ action: 'gin', cards: [id] })
      else if (left <= s.knock) out.push({ action: 'knock', cards: [id] })
    }
    return out
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    if (move.action === 'pass') {
      // Both passed the upcard: the non-dealer draws from the stock.
      if (slice.passes + 1 >= 2) return { ...slice, phase: 'draw', passes: 0, noTake: true, next: 1 - slice.dealer }
      return { ...slice, passes: slice.passes + 1, next: 1 - seat }
    }
    if (move.action === 'draw' || move.action === 'take') {
      const taking = move.action === 'take'
      const card = taking ? slice.discard[slice.discard.length - 1] : slice.drawPile[0]
      return {
        ...slice,
        hands: slice.hands.map((h, i) => (i === seat ? [...h, card] : h)),
        discard: taking ? slice.discard.slice(0, -1) : slice.discard,
        drawPile: taking ? slice.drawPile : slice.drawPile.slice(1),
        phase: 'discard',
        noTake: false,
        fromDiscard: taking ? card : null,
        next: seat,
      }
    }
    if (move.action === 'big gin') return score(slice, seat, 'big gin', ctx)
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(x => x !== move.cards[0]) : h))
    const after = { ...slice, hands, discard: [...slice.discard, move.cards[0]] }
    if (move.action === 'knock' || move.action === 'gin') return score(after, seat, move.action, ctx)
    // Nobody knocked before the stock ran down: the hand is void, the same dealer deals again.
    if (after.drawPile.length <= s.floor) return dealHand({ ...after, shown: { void: true } }, slice.hand + 1, slice.dealer, ctx)
    return { ...after, phase: 'draw', fromDiscard: null, next: 1 - seat }
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
    const r = view.shown
    if (r && !r.void) {
      const who = ctx.names[r.knocker] || `Player ${r.knocker + 1}`
      groups.push({ label: `${who}: ${r.kind}, deadwood ${describeCards(r.deadwood, ctx) || 'none'} · ${ctx.names[r.winner] || `Player ${r.winner + 1}`} scored ${r.points}`, cards: r.melds.flat() })
    }
    return groups
  },

  describeSeat(view, seat, ctx) {
    const hand = view.hands[seat]
    const parts = [`score ${view.scores[seat]}`, `${view.boxes[seat]} ${view.boxes[seat] === 1 ? 'hand' : 'hands'} won`]
    if (hand.every(id => id !== null)) parts.push(`deadwood ${bestArrangement(hand, ctx).value}`)
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    return `${shown[slice.finished]} wins, ${slice.totals[slice.finished]} to ${slice.totals[1 - slice.finished]} with bonuses`
  },

  // Take a card that lowers the deadwood; knock or go gin whenever allowed;
  // otherwise shed the card that leaves the least deadwood.
  policy(view, seat, moves, ctx) {
    const hand = view.hands[seat]
    const now = bestArrangement(hand, ctx).value
    if (view.phase === 'upcard' || view.phase === 'draw') {
      const top = view.discard[view.discard.length - 1]
      const withTop = top ? Math.min(...hand.map(id => bestArrangement([...hand, top].filter(x => x !== id), ctx).value)) : Infinity
      const take = moves.find(m => m.action === 'take')
      if (take && withTop < now) return take
      return moves.find(m => m.action === 'draw') || moves.find(m => m.action === 'pass')
    }
    const pick = (action) => moves.filter(m => m.action === action)
    if (pick('big gin').length) return pick('big gin')[0]
    if (pick('gin').length) return pick('gin')[0]
    if (pick('knock').length) return pick('knock').reduce((a, b) => (after(a) <= after(b) ? a : b))
    return pick('discard').reduce((a, b) => (after(a) <= after(b) ? a : b))
    function after(m) { return bestArrangement(hand.filter(x => x !== m.cards[0]), ctx).value }
  },

  describe(move, ctx) {
    if (move.action === 'draw') return 'draws'
    if (move.action === 'take') return 'takes the discard'
    if (move.action === 'pass' || move.action === 'big gin') return move.action
    if (move.action === 'discard') return `discards ${describeCards(move.cards, ctx)}`
    return `${move.action}s, discarding ${describeCards(move.cards, ctx)}`
  },
}

