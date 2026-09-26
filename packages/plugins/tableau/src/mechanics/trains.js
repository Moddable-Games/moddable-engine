import { dealRound, closeHand, after, tileMatches, otherEnd, roundLine } from './domino-rounds.js'

// Trains: Mexican Train (engine#184). From Pagat: "each player starts to
// build a train" from the double in the centre. "In this first turn only, the
// player may play as many dominoes as they wish, so long as they form a valid
// train." After that "each player plays just one domino per turn (unless that
// domino is a double)", on their own train, on "the Mexican Train ... always
// open to all players", or on another player's train "if that train is marked
// with a penny".
//
// A player who cannot play draws one, may play it, and otherwise passes and
// marks their own train open. Playing on their own marked train takes the
// marker off. "Whenever you play a double you must play an extra domino", and
// a train left ending in a double must be "satisfied": the next tile added
// anywhere goes on it, a duty that passes round the table.
//
//     game: trains
//     publicTrain: true
//     tilesPerPlayer: { 2: 15, 5: 12, 7: 10, 9: 8 }
//
// Hands, scoring and the end of the game are domino-rounds.js.

const PUBLIC = 'public'

function trainOf(slice, key) {
  return key === PUBLIC ? slice.publicTrain : slice.trains[key]
}

function endOf(slice, key) {
  const line = trainOf(slice, key)
  return line.length ? line[line.length - 1].out : slice.value
}

function endsInDouble(slice, key) {
  const line = trainOf(slice, key)
  return line.length > 0 && line[line.length - 1].double
}

// Which trains a seat may add to this turn.
function reachable(slice, seat, ctx) {
  if (!slice.started[seat]) return [seat]
  const keys = [seat]
  if (ctx.config.publicTrain !== false) keys.push(PUBLIC)
  slice.markers.forEach((open, other) => { if (open && other !== seat) keys.push(other) })
  // An unsatisfied double takes the next tile, whoever's train it is.
  const owing = slice.owing && slice.owing.seat === seat
  if (!owing && slice.unsatisfied.length) return [...slice.unsatisfied]
  return keys
}

function plays(slice, seat, ctx, only = null) {
  const out = []
  const hand = only ? [only] : slice.hands[seat]
  const keys = reachable(slice, seat, ctx)
  for (const id of hand) {
    for (const key of keys) {
      if (tileMatches(id, endOf(slice, key), ctx)) out.push({ action: 'play', cards: [id], train: key })
    }
  }
  return out
}

function deal(slice, handNo, ctx) {
  const dealt = dealRound(slice, handNo, ctx)
  const seats = ctx.seats
  return {
    ...slice,
    hand: handNo,
    hands: dealt.hands,
    drawPile: dealt.drawPile,
    hub: dealt.double,
    value: dealt.value,
    trains: Array.from({ length: seats }, () => []),
    publicTrain: [],
    markers: Array(seats).fill(false),
    started: Array(seats).fill(false),
    unsatisfied: [],
    owing: null,
    drew: null,
    runLength: 0,
    passes: 0,
    next: dealt.first,
  }
}

function endTurn(slice, seat, ctx) {
  const started = slice.started.map((s, i) => (i === seat ? true : s))
  return { ...slice, started, owing: null, drew: null, runLength: 0, next: after(seat, ctx) }
}

export const trains = {
  init(base, ctx) {
    return deal({ seed: ctx.seed || 1, totals: Array(ctx.seats).fill(0), finished: null, next: null }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const first = !slice.started[seat]
    const options = plays(slice, seat, ctx, slice.drew)
    // A first turn is a run on one's own train, ended when the player likes.
    if (first && slice.runLength > 0) return [...options, { action: 'end' }]
    if (options.length) return options
    if (!slice.drew && slice.drawPile.length) return [{ action: 'draw' }]
    return [{ action: 'pass' }]
  },

  apply(move, slice, seat, ctx) {
    if (move.action === 'draw') {
      const [tile, ...rest] = slice.drawPile
      return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? [...h, tile] : h)), drawPile: rest, drew: tile, passes: 0, next: seat }
    }
    if (move.action === 'end') return endTurn(slice, seat, ctx)
    if (move.action === 'pass') {
      const markers = slice.markers.map((m, i) => (i === seat ? true : m))
      const passes = slice.drawPile.length ? 0 : slice.passes + 1
      const next = endTurn({ ...slice, markers, passes }, seat, ctx)
      // Nobody can play and there is nothing left to draw.
      if (passes >= ctx.seats) return closeHand(next, ctx, (s, n) => deal(s, n, ctx))
      return next
    }

    const id = move.cards[0]
    const key = move.train
    const tile = ctx.card(id)
    const out = otherEnd(id, endOf(slice, key), ctx)
    const line = [...trainOf(slice, key), { id, out, double: tile.isDouble }]
    let next = {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h.filter(t => t !== id) : h)),
      trains: key === PUBLIC ? slice.trains : slice.trains.map((t, i) => (i === key ? line : t)),
      publicTrain: key === PUBLIC ? line : slice.publicTrain,
      markers: key === seat ? slice.markers.map((m, i) => (i === seat ? false : m)) : slice.markers,
      unsatisfied: slice.unsatisfied.filter(k => k !== key),
      drew: null,
      passes: 0,
    }
    // Going out ends the hand, even on a double.
    if (next.hands[seat].length === 0) return closeHand(next, ctx, (s, n) => deal(s, n, ctx))

    if (!slice.started[seat]) return { ...next, runLength: slice.runLength + 1, next: seat }
    if (tile.isDouble) {
      // A double earns another tile, and stays owed until something is played on it.
      return { ...next, unsatisfied: [...next.unsatisfied, key], owing: { seat }, next: seat }
    }
    return endTurn(next, seat, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  project(slice, seat) {
    return {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))),
      drawPile: slice.drawPile.map(() => null),
      drew: slice.next === seat ? slice.drew : null,
    }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = [{ label: `Engine ${view.value}|${view.value} · boneyard ${view.drawPile.length}`, cards: [view.hub] }]
    const label = (key, base) => {
      const parts = [base]
      if (key !== PUBLIC && view.markers[key]) parts.push('open')
      if (view.unsatisfied.includes(key)) parts.push('double to answer')
      parts.push(`ends ${endOf(view, key)}`)
      return parts.join(' · ')
    }
    view.trains.forEach((line, seat) => {
      if (line.length) groups.push({ label: label(seat, `${name(seat)}'s train`), cards: line.map(p => p.id) })
    })
    if (view.publicTrain.length) groups.push({ label: label(PUBLIC, 'Mexican Train'), cards: view.publicTrain.map(p => p.id) })
    return groups
  },

  describeSeat(view, seat, ctx) {
    const parts = [`${view.totals[seat]} pips`]
    if (view.markers[seat]) parts.push('train open')
    parts.push(roundLine(view, ctx))
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return `A tie on ${Math.min(...slice.totals)} pips`
    return `${shown[slice.finished]} wins with ${slice.totals[slice.finished]} pips`
  },

  // Keep a run going on the first turn; afterwards answer a double, shed the
  // heaviest tile, and prefer one's own train to helping anyone else's.
  policy(view, seat, moves, ctx) {
    const tilePlays = moves.filter(m => m.action === 'play')
    if (!tilePlays.length) return moves[0]
    const worth = (m) => ctx.card(m.cards[0]).total * 2 + (m.train === seat ? 3 : 0) + (ctx.card(m.cards[0]).isDouble ? 1 : 0)
    return tilePlays.reduce((best, m) => (worth(m) > worth(best) ? m : best))
  },

  describe(move, ctx) {
    if (move.action !== 'play') return move.action
    const face = ctx.card(move.cards[0])?.display || move.cards[0]
    return move.train === PUBLIC ? `${face} on the Mexican Train` : face
  },
}

