import { dealRound, closeHand, after, tileMatches, otherEnd, roundLine } from './domino-rounds.js'

// Branching: Chickenfoot (engine#184). From Pagat: "The initial double must
// have tiles played on all four arms before any arm is extended by a second
// tile on it." Every double after it is a chicken foot: "The toes of the
// chicken foot -- the open arms of the spinner -- must be filled with three
// more dominoes before tiles can be played elsewhere." A tile is played on any
// open end otherwise. "A player unable to make a play on the table must draw a
// tile ... If this tile can be played, the player may do so at once." With
// nothing left to draw, a player who cannot play misses a turn.
//
//     game: branching
//     openingArms: 4        # ends the first double opens, all filled before anything else
//     doubleToes: 3         # ends every later double opens, likewise
//     tilesPerPlayer: { 2: 20, 3: 14, 4: 11, 5: 9, 6: 7 }
//     blankDouble: 50
//     afterStart: next
//
// An end still waiting for its toe is marked `toe`; while any is, only those
// may be played on. Hands, scoring and the end of the game are domino-rounds.js.

function deal(slice, handNo, ctx) {
  const dealt = dealRound(slice, handNo, ctx)
  const arms = Number(ctx.config.openingArms ?? 4)
  let n = 0
  const ends = Array.from({ length: arms }, () => ({ key: `e${n++}`, value: dealt.value, toe: true }))
  return {
    ...slice,
    hand: handNo,
    hands: dealt.hands,
    drawPile: dealt.drawPile,
    root: dealt.double,
    value: dealt.value,
    ends,
    endCount: n,
    played: [],
    drew: null,
    passes: 0,
    next: dealt.first,
  }
}

function openEnds(slice) {
  const toes = slice.ends.filter(e => e.toe)
  return toes.length ? toes : slice.ends
}

function plays(slice, seat, ctx) {
  const out = []
  const hand = slice.drew ? [slice.drew] : slice.hands[seat]
  for (const id of hand) {
    // Ends showing the same number are the same choice.
    const seen = new Set()
    for (const end of openEnds(slice)) {
      if (seen.has(end.value) || !tileMatches(id, end.value, ctx)) continue
      seen.add(end.value)
      out.push({ action: 'play', cards: [id], end: end.key })
    }
  }
  return out
}

export const branching = {
  init(base, ctx) {
    return deal({ seed: ctx.seed || 1, totals: Array(ctx.seats).fill(0), finished: null, next: null }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const options = plays(slice, seat, ctx)
    if (options.length) return options
    if (!slice.drew && slice.drawPile.length) return [{ action: 'draw' }]
    return [{ action: 'pass' }]
  },

  apply(move, slice, seat, ctx) {
    if (move.action === 'draw') {
      const [tile, ...rest] = slice.drawPile
      return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? [...h, tile] : h)), drawPile: rest, drew: tile, passes: 0, next: seat }
    }
    if (move.action === 'pass') {
      const passes = slice.drawPile.length ? 0 : slice.passes + 1
      const next = { ...slice, drew: null, passes, next: after(seat, ctx) }
      if (passes >= ctx.seats) return closeHand(next, ctx, (s, n) => deal(s, n, ctx))
      return next
    }

    const id = move.cards[0]
    const end = slice.ends.find(e => e.key === move.end)
    const tile = ctx.card(id)
    let count = slice.endCount
    const grown = tile.isDouble
      ? Array.from({ length: Number(ctx.config.doubleToes ?? 3) }, () => ({ key: `e${count++}`, value: tile.high, toe: true }))
      : [{ key: `e${count++}`, value: otherEnd(id, end.value, ctx), toe: false }]
    const next = {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h.filter(t => t !== id) : h)),
      ends: [...slice.ends.filter(e => e.key !== end.key), ...grown],
      endCount: count,
      played: [...slice.played, id],
      drew: null,
      passes: 0,
      next: after(seat, ctx),
    }
    if (next.hands[seat].length === 0) return closeHand(next, ctx, (s, n) => deal(s, n, ctx))
    return next
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

  // The layout branches, so it is listed rather than drawn as one line: the
  // opening double, then the tiles in the order they were played, and the
  // numbers still open.
  table(view) {
    const toes = view.ends.filter(e => e.toe)
    const open = toes.length
      ? `Chicken foot: ${toes.length} × ${toes[0].value} to fill`
      : `Open ends: ${[...view.ends.map(e => e.value)].sort((a, b) => a - b).join(' ')}`
    const recent = view.played.slice(-12)
    const groups = [{ label: `${open} · boneyard ${view.drawPile.length}`, cards: [view.root] }]
    if (recent.length) groups.push({ label: view.played.length > recent.length ? `Last ${recent.length} played` : 'Played', cards: recent })
    return groups
  },

  describeSeat(view, seat, ctx) {
    return `${view.totals[seat]} points · ${roundLine(view, ctx)}`
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return `A tie on ${Math.min(...slice.totals)} points`
    return `${shown[slice.finished]} wins with ${slice.totals[slice.finished]} points`
  },

  // Shed the heaviest tile, the [0|0] first since it costs the most.
  policy(view, seat, moves, ctx) {
    const tilePlays = moves.filter(m => m.action === 'play')
    if (!tilePlays.length) return moves[0]
    const cost = (m) => (m.cards[0] === '0_0' && ctx.config.blankDouble !== undefined ? Number(ctx.config.blankDouble) : ctx.card(m.cards[0]).total)
    return tilePlays.reduce((best, m) => (cost(m) > cost(best) ? m : best))
  },

  describe(move, ctx) {
    if (move.action !== 'play') return move.action
    return ctx.card(move.cards[0])?.display || move.cards[0]
  },
}
