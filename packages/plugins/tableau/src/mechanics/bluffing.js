import { createRng } from '../../../../core/index.js'

// Bluffing: Liar's Dice (engine#184), from its page. "Each player has 5 dice
// hidden under a cup", and bids "on how many dice of a given face value exist
// across all players' dice combined". A raise must be "strictly higher": a
// higher quantity, or the same quantity of a higher face. A challenge reveals
// every die: "If the count meets or exceeds the bid, the challenger loses one
// die"; otherwise the bidder does. Everyone rolls again, and "the player who
// lost a die makes the first bid". "A player with 0 dice is eliminated. The
// last player with any dice wins."
//
//     game: bluffing
//     dicePerPlayer: 5
//     faces: 6

const FACE_NAMES = ['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
const FACE_NAME = ['', 'one', 'two', 'three', 'four', 'five', 'six']

function settings(ctx) {
  return {
    each: Number(ctx.config.dicePerPlayer ?? 5),
    faces: Number(ctx.config.faces ?? 6),
  }
}

// A die is named by its owner, its place and the face it shows: `die7-3`.
const dieId = (index, face) => `die${index}-${face}`
const faceOf = (id) => Number(String(id).split('-')[1])

const bidLabel = (qty, face) => `${qty} ${(qty === 1 ? FACE_NAME : FACE_NAMES)[face] || `×${face}`}`
function parseBid(value) {
  const [qty, word] = String(value).split(' ')
  const face = Math.max(FACE_NAMES.indexOf(word), FACE_NAME.indexOf(word))
  return { qty: Number(qty), face: face > 0 ? face : Number(word.replace('×', '')) }
}

function roll(slice, ctx) {
  const s = settings(ctx)
  const rng = createRng((slice.seed ^ Math.imul(slice.round + 1, 0x9E3779B1)) >>> 0)
  const hands = slice.counts.map((n, seat) => Array.from({ length: n }, (_, k) => dieId(seat * s.each + k, rng.nextInt(1, s.faces))))
  return { ...slice, hands, bid: null }
}

function nextAlive(counts, from) {
  for (let k = 1; k <= counts.length; k++) {
    const seat = (from + k) % counts.length
    if (counts[seat] > 0) return seat
  }
  return from
}

export const bluffing = {
  init(base, ctx) {
    const s = settings(ctx)
    return roll({ seed: ctx.seed || 1, round: 0, counts: Array(ctx.seats).fill(s.each), community: [], drawPile: [], finished: null, reveal: null, next: 0 }, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    const total = slice.counts.reduce((a, b) => a + b, 0)
    const out = []
    for (let qty = 1; qty <= total; qty++) {
      for (let face = 1; face <= s.faces; face++) {
        if (slice.bid && (qty < slice.bid.qty || (qty === slice.bid.qty && face <= slice.bid.face))) continue
        out.push({ action: 'bid', value: bidLabel(qty, face) })
      }
    }
    if (slice.bid) out.push({ action: 'challenge' })
    return out
  },

  apply(move, slice, seat, ctx) {
    if (move.action === 'bid') {
      return { ...slice, bid: { ...parseBid(move.value), seat }, next: nextAlive(slice.counts, seat) }
    }
    // A challenge: every die is shown and counted.
    const { qty, face, seat: bidder } = slice.bid
    const count = slice.hands.flat().filter(id => faceOf(id) === face).length
    const loser = count >= qty ? seat : bidder
    const counts = slice.counts.map((n, i) => (i === loser ? n - 1 : n))
    const reveal = { hands: slice.hands, bid: slice.bid, challenger: seat, count, loser }
    const alive = counts.filter(n => n > 0).length
    if (alive <= 1) return { ...slice, counts, reveal, bid: null, finished: counts.findIndex(n => n > 0), next: null }
    const next = counts[loser] > 0 ? loser : nextAlive(counts, loser)
    return roll({ ...slice, counts, reveal, round: slice.round + 1, next }, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  // A player sees their own dice under the cup and nobody else's.
  project(slice, seat) {
    return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))) }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    if (view.bid) groups.push({ label: `${name(view.bid.seat)} bids ${bidLabel(view.bid.qty, view.bid.face)}`, cards: [] })
    else groups.push({ label: 'Opening bid', cards: [] })
    if (view.reveal) {
      const r = view.reveal
      groups.push({ label: `Last challenge: ${name(r.challenger)} called ${bidLabel(r.bid.qty, r.bid.face)}; there were ${r.count}. ${name(r.loser)} lost a die`, cards: r.hands.flat() })
    }
    return groups
  },

  describeSeat(view, seat) {
    return view.counts[seat] > 0 ? `${view.counts[seat]} dice` : 'out'
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    return `${shown[slice.finished]} wins, the last with dice`
  },

  // Expect a sixth of the unseen dice to show any face. Challenge a bid well
  // above that; otherwise make the smallest raise on the face held most.
  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    const mine = view.hands[seat]
    const unseen = view.counts.reduce((a, b) => a + b, 0) - mine.length
    const expect = (face) => mine.filter(id => faceOf(id) === face).length + unseen / s.faces
    if (view.bid && view.bid.qty > expect(view.bid.face) + 1) return moves.find(m => m.action === 'challenge')
    const bids = moves.filter(m => m.action === 'bid').map(m => ({ m, ...parseBid(m.value) }))
    const safe = bids.filter(b => b.qty <= Math.floor(expect(b.face)))
    const pickFrom = safe.length ? safe : bids.slice(0, 1)
    const best = pickFrom.sort((a, b) => a.qty - b.qty || expect(b.face) - expect(a.face))[0]
    return best ? best.m : moves.find(m => m.action === 'challenge')
  },

  describe(move) {
    return move.action === 'bid' ? `bids ${move.value}` : 'calls liar'
  },
}
