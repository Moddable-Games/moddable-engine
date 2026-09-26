import { createRng } from '../../../../core/index.js'

// What the domino games that run a hand per double share (engine#184):
// Mexican Train and Chickenfoot open each hand on a double, the highest in the
// set first and one lower each hand after, play until someone is out or
// nobody can move, and charge every player the pips left in their hand. The
// lowest total after the last double wins.
//
//     tilesPerPlayer: { 2: 15, 5: 12 }   # by number of players
//     blankDouble: 50                    # what the [0|0] costs, where it costs more than nothing
//     afterStart: holder | next          # who plays first once the double is down

// The highest number on any tile of the set in play.
function highest(ctx) {
  return ctx.deck.reduce((n, t) => Math.max(n, t.high ?? 0), 0)
}

function handsInGame(ctx) {
  return highest(ctx) + 1
}

// Tiles each, by the number at the table. A count the table does not list
// falls to the nearest smaller one it does.
function tilesEach(ctx) {
  const table = ctx.config.tilesPerPlayer || {}
  for (let n = ctx.seats; n >= 1; n--) if (table[n] !== undefined) return Number(table[n])
  return 7
}

// Deal a hand and put its double down. Where nobody holds the double, each
// player draws one in turn until it is found.
export function dealRound(slice, handNo, ctx) {
  const seats = ctx.seats
  const top = highest(ctx) - handNo
  const double = `${top}_${top}`
  let pool = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(t => t.id))
  const each = tilesEach(ctx)
  const hands = Array.from({ length: seats }, () => [])
  for (let k = 0; k < each; k++) for (let p = 0; p < seats; p++) if (pool.length) hands[p].push(pool.shift())
  let holder = hands.findIndex(h => h.includes(double))
  for (let p = 0; holder < 0 && pool.length; p = (p + 1) % seats) {
    const tile = pool.shift()
    hands[p].push(tile)
    if (tile === double) holder = p
  }
  if (holder >= 0) hands[holder] = hands[holder].filter(id => id !== double)
  const starter = holder < 0 ? 0 : holder
  const first = ctx.config.afterStart === 'next' ? (starter + 1) % seats : starter
  return { hands, drawPile: pool, double, value: top, starter, first }
}

function pipsLeft(hand, ctx) {
  const blank = ctx.config.blankDouble
  return hand.reduce((n, id) => n + (id === '0_0' && blank !== undefined ? Number(blank) : ctx.card(id).total), 0)
}

// The hand is over: charge the pips, then deal the next or end the game.
export function closeHand(slice, ctx, redeal) {
  const charged = slice.hands.map(h => pipsLeft(h, ctx))
  const totals = slice.totals.map((v, i) => v + charged[i])
  const lastHand = { charged, out: slice.hands.findIndex(h => h.length === 0) }
  if (slice.hand + 1 >= handsInGame(ctx)) {
    const least = Math.min(...totals)
    const lowest = totals.map((v, i) => (v === least ? i : -1)).filter(i => i >= 0)
    return { ...slice, totals, lastHand, finished: lowest.length === 1 ? lowest[0] : 'draw', next: null }
  }
  return redeal({ ...slice, totals, lastHand }, slice.hand + 1)
}

// The seat after this one.
export const after = (seat, ctx) => (seat + 1) % ctx.seats

export function tileMatches(id, value, ctx) {
  const t = ctx.card(id)
  return t.low === value || t.high === value
}

export function otherEnd(id, value, ctx) {
  const t = ctx.card(id)
  return t.low === value ? t.high : t.low
}

export function roundLine(view, ctx) {
  return `hand ${view.hand + 1} of ${handsInGame(ctx)}`
}
