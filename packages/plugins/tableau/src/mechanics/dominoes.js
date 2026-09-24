import { deal } from '../../../../component-deck/index.js'
import { createRng } from '../../../../core/index.js'

// Dominoes: Block and All Fives. "Players match tiles end-to-end to extend a
// chain": a tile is played by matching one of its halves to an open end.
// "The player with the highest double plays it first. If no player holds a
// double, the player with the highest single tile starts." A player who
// cannot play draws from the boneyard where the game has one, and otherwise
// passes. The first player out wins the hand; if nobody can play, the lowest
// pip total does.
//
//     game: dominoes
//     draw: true              # draw from the boneyard until a tile plays
//     spinner: true           # the first double opens four ways
//     scoreFives: true        # score the open ends whenever they total a multiple of 5
//     scoring:
//       out: opponents        # the player out scores every other hand's pips
//       blocked: others-minus-own | others
//       roundTo: 5            # to the nearest
//     target: 61              # hands are played until a score reaches it
//
// A tile's end is part of its move - `{ cards: [id], end: left }` - since one
// tile can often go on either end, and which is the player's choice.

const ARMS = ['left', 'right', 'up', 'down']

function settings(ctx) {
  const c = ctx.config
  return {
    draw: !!c.draw,
    spinner: !!c.spinner,
    fives: !!c.scoreFives,
    scoring: c.scoring || null,
    target: c.target ?? null,
  }
}

const pips = (hand, ctx) => hand.reduce((n, id) => n + ctx.card(id).total, 0)

// Who opens: the highest double, else the highest tile.
function opener(hands, ctx) {
  let best = null
  hands.forEach((hand, seat) => {
    for (const id of hand) {
      const t = ctx.card(id)
      const worth = (t.isDouble ? 100 : 0) + t.total
      if (!best || worth > best.worth) best = { seat, id, worth }
    }
  })
  return best
}

function dealHand(slice, handNo, ctx) {
  const ids = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const dealt = deal(ids, { ...(ctx.config.deal || {}), players: ctx.seats })
  const first = opener(dealt.hands, ctx)
  return {
    ...slice,
    hands: dealt.hands,
    drawPile: dealt.drawPile || [],
    community: [],
    hand: handNo,
    first: null,
    arms: { left: [], right: [], up: [], down: [] },
    ends: {},
    opening: first ? first.id : null,
    passes: 0,
    next: first ? first.seat : 0,
  }
}

// The pips showing at each open end, and whether the tile there is a double.
function openEnds(slice, s) {
  if (!slice.first) return []
  const firstTile = slice.first
  const out = []
  for (const arm of ARMS) {
    const line = slice.arms[arm]
    if (line.length) {
      const last = line[line.length - 1]
      out.push({ arm, value: last.out, double: last.double })
      continue
    }
    if (arm === 'left') out.push({ arm, value: firstTile.low, double: firstTile.double })
    else if (arm === 'right') out.push({ arm, value: firstTile.high, double: firstTile.double })
    else if (s.spinner && firstTile.double && slice.arms.left.length && slice.arms.right.length) {
      // A spinner's other two sides open once both of its first sides are played on.
      out.push({ arm, value: firstTile.high, double: firstTile.double })
    }
  }
  return out
}

// All Fives counts the ends: a double at an end counts both halves, and the
// first double counts both of its halves while either of its sides is open.
function endTotal(slice, s) {
  if (!slice.first) return 0
  const f = slice.first
  const left = slice.arms.left, right = slice.arms.right
  const endOf = (line) => { const last = line[line.length - 1]; return last.double ? last.out * 2 : last.out }
  let total = 0
  if (f.double) {
    if (!left.length || !right.length) total += f.high * 2
    if (left.length) total += endOf(left)
    if (right.length) total += endOf(right)
  } else {
    total += left.length ? endOf(left) : f.low
    total += right.length ? endOf(right) : f.high
  }
  for (const arm of ['up', 'down']) if (slice.arms[arm].length) total += endOf(slice.arms[arm])
  return total
}

function roundTo(n, step) {
  return step ? Math.round(n / step) * step : n
}

function endOfHand(slice, winner, ctx) {
  const s = settings(ctx)
  const totals = slice.hands.map(h => pips(h, ctx))
  let gain = 0
  if (winner !== 'draw' && s.scoring) {
    const others = totals.reduce((n, t, i) => (i === winner ? n : n + t), 0)
    const out = slice.hands[winner].length === 0
    gain = out || s.scoring.blocked !== 'others-minus-own' ? others : others - totals[winner]
    gain = roundTo(Math.max(0, gain), s.scoring.roundTo)
  }
  const scores = slice.scores.map((v, i) => (i === winner ? v + gain : v))
  const lastHand = { winner, totals, gain }
  if (s.target === null) {
    return { ...slice, scores, lastHand, finished: winner, next: null }
  }
  const reached = scores.map((v, i) => (v >= s.target ? i : -1)).filter(i => i >= 0)
  if (reached.length) {
    const best = Math.max(...reached.map(i => scores[i]))
    const top = reached.filter(i => scores[i] === best)
    if (top.length === 1) return { ...slice, scores, lastHand, finished: top[0], next: null }
  }
  return dealHand({ ...slice, scores, lastHand }, slice.hand + 1, ctx)
}

export const dominoes = {
  init(base, ctx) {
    return dealHand({ seed: ctx.seed || 1, scores: Array(ctx.seats).fill(0), finished: null, next: null }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    if (!slice.first) {
      return slice.hands[seat].includes(slice.opening) ? [{ action: 'play', cards: [slice.opening], end: 'start' }] : []
    }
    const out = []
    const ends = openEnds(slice, s)
    for (const id of slice.hands[seat]) {
      const t = ctx.card(id)
      const seen = new Set()
      for (const end of ends) {
        if (t.low !== end.value && t.high !== end.value) continue
        // Two ends showing the same number are the same choice for a tile
        // that is not a double; offered once each all the same, so a player
        // can pick the arm.
        if (seen.has(end.arm)) continue
        seen.add(end.arm)
        out.push({ action: 'play', cards: [id], end: end.arm })
      }
    }
    if (out.length) return out
    if (s.draw && slice.drawPile.length) return [{ action: 'draw' }]
    return [{ action: 'pass' }]
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    if (move.action === 'draw') {
      const [top, ...rest] = slice.drawPile
      return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? [...h, top] : h)), drawPile: rest, passes: 0, next: seat }
    }
    if (move.action === 'pass') {
      const passes = slice.passes + 1
      if (passes < ctx.seats) return { ...slice, passes, next: null }
      // Blocked: nobody can play. The lowest pip total wins the hand.
      const totals = slice.hands.map(h => pips(h, ctx))
      const least = Math.min(...totals)
      const low = totals.map((t, i) => (t === least ? i : -1)).filter(i => i >= 0)
      return endOfHand({ ...slice, passes }, low.length === 1 ? low[0] : 'draw', ctx)
    }

    const id = move.cards[0]
    const t = ctx.card(id)
    const hands = slice.hands.map((h, i) => (i === seat ? h.filter(c => c !== id) : h))
    let next = { ...slice, hands, passes: 0, next: null }
    if (move.end === 'start') {
      next.first = { id, low: t.low, high: t.high, double: t.isDouble }
    } else {
      const end = openEnds(slice, s).find(e => e.arm === move.end)
      const out = t.low === end.value ? t.high : t.low
      next.arms = { ...slice.arms, [move.end]: [...slice.arms[move.end], { id, out, double: t.isDouble }] }
    }
    const scored = s.fives ? endTotal(next, s) : 0
    if (scored > 0 && scored % 5 === 0) {
      next.scores = next.scores.map((v, i) => (i === seat ? v + scored : v))
      next.lastScore = { seat, points: scored }
    } else {
      next.lastScore = null
    }
    if (s.target !== null && next.scores[seat] >= s.target) return { ...next, finished: seat }
    if (hands[seat].length === 0) return endOfHand(next, seat, ctx)
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
    }
  },

  // The line as it lies: the left arm running out from the first tile, the
  // first tile, then the right arm; a spinner's other arms beneath.
  // The tiles are drawn upright, so the label says what each end shows.
  table(view, ctx) {
    if (!view.first) return []
    const line = [...view.arms.left].reverse().map(p => p.id).concat([view.first.id], view.arms.right.map(p => p.id))
    const ends = openEnds(view, settings(ctx)).map(e => `${e.arm} ${e.value}`).join(' · ')
    const groups = [{ label: `Open ends: ${ends}${view.drawPile.length ? ` · boneyard ${view.drawPile.length}` : ''}${view.lastScore ? ` · +${view.lastScore.points}` : ''}`, cards: line }]
    for (const arm of ['up', 'down']) if (view.arms[arm].length) groups.push({ label: arm, cards: view.arms[arm].map(p => p.id) })
    return groups
  },

  describeSeat(view, seat) {
    return view.scores.some(v => v > 0) || view.hand > 0 ? `score ${view.scores[seat]}` : null
  },

  // Score if a tile scores; otherwise shed the heaviest tile.
  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    const plays = moves.filter(m => m.action === 'play')
    if (!plays.length) return moves[0]
    let best = null
    for (const m of plays) {
      const after = dominoes.apply(m, { ...view, hands: view.hands.map((h, i) => (i === seat ? h : [])) }, seat, ctx)
      const gained = after.lastScore ? after.lastScore.points : 0
      const worth = (s.fives ? gained * 10 : 0) + ctx.card(m.cards[0]).total
      if (!best || worth > best.worth) best = { m, worth }
    }
    return best.m
  },

  describe(move, ctx) {
    if (move.action !== 'play') return move.action
    const face = ctx.card(move.cards[0])?.display || move.cards[0]
    return move.end === 'start' ? face : `${face} ${move.end}`
  },
}
