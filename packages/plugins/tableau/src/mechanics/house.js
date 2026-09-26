import { createRng } from '../../../../core/index.js'
import { chipSettings, betsFor, richest } from './chips.js'

// House: Blackjack (engine#184). The first seat is the house, which "has no
// choices - their play is entirely rule-determined"; every other seat plays
// against it for play chips. From the page:
//
//   - each player bets, then takes two cards face up; the house takes an
//     upcard and a hole card;
//   - "If a player's first two cards are an Ace and a 10-value card, they have
//     Blackjack ... paid 3:2 ..., unless the dealer also has Blackjack";
//     with an Ace showing, players may insure for half their bet, paid 2:1;
//   - hit, stand, double down on the first two cards, split a pair once (split
//     Aces take one card each), or surrender for half the bet;
//   - "Dealer must hit on any total of 16 or less" and stand on 17 or more.
//
//     game: house
//     chips: { start: 100, bets: [1, 2, 5, 10, 25] }
//     hitSoft17: false
//     rounds: 10

const TEN = new Set(['10', 'J', 'Q', 'K'])

function settings(ctx) {
  const c = ctx.config
  return { hitSoft17: !!c.hitSoft17, rounds: Number(c.rounds ?? 10) || 10 }
}

// A hand's best total, and whether an Ace is counted as eleven in it.
export function total(cards, ctx) {
  let sum = 0, aces = 0
  for (const id of cards) {
    const r = ctx.card(id).rank
    if (r === 'A') { aces++; sum += 1 } else sum += TEN.has(r) ? 10 : Number(r)
  }
  const soft = aces > 0 && sum + 10 <= 21
  return { value: soft ? sum + 10 : sum, soft }
}

const isBlackjack = (cards, ctx) => cards.length === 2 && total(cards, ctx).value === 21
const valueOfRank = (id, ctx) => { const r = ctx.card(id).rank; return r === 'A' ? 11 : TEN.has(r) ? 10 : Number(r) }

const punters = (slice) => slice.stacks.map((_, i) => i).filter(i => i !== 0)

function startRound(slice, ctx) {
  const s = settings(ctx)
  const playing = punters(slice).filter(i => slice.stacks[i] > 0)
  if (slice.round >= s.rounds || !playing.length) {
    return { ...slice, phase: 'over', finished: richest(slice.stacks, punters(slice)), next: null }
  }
  return {
    ...slice,
    phase: 'bet',
    bets: slice.stacks.map(() => 0),
    boxes: slice.stacks.map(() => []),
    house: [],
    insured: slice.stacks.map(() => 0),
    active: null,
    revealed: false,
    next: playing[0],
  }
}

function draw(slice) {
  const [card, ...rest] = slice.shoe
  return [card, { ...slice, shoe: rest }]
}

function deal(slice, ctx) {
  // A continuous shuffle: every round is dealt from the whole shoe.
  let next = { ...slice, shoe: createRng((slice.seed ^ Math.imul(slice.round + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id)) }
  const players = punters(next).filter(i => next.bets[i] > 0)
  const boxes = next.stacks.map(() => [])
  const house = []
  for (let k = 0; k < 2; k++) {
    for (const seat of players) {
      let card
      ;[card, next] = draw(next)
      if (!boxes[seat].length) boxes[seat].push({ cards: [], bet: next.bets[seat], done: false })
      boxes[seat][0].cards.push(card)
    }
    let card
    ;[card, next] = draw(next)
    house.push(card)
  }
  next = { ...next, boxes, house }
  const upcard = ctx.card(house[0]).rank
  if (upcard === 'A') {
    const insurers = players.filter(i => next.stacks[i] >= Math.floor(next.bets[i] / 2) && Math.floor(next.bets[i] / 2) > 0)
    if (insurers.length) return { ...next, phase: 'insurance', asked: insurers, next: insurers[0] }
  }
  return afterInsurance(next, ctx)
}

// The house looks at its hole card when it shows an Ace or a ten, and a
// Blackjack there settles the round at once.
function afterInsurance(slice, ctx) {
  const upcard = ctx.card(slice.house[0]).rank
  const peeks = upcard === 'A' || TEN.has(upcard)
  let stacks = [...slice.stacks]
  if (peeks && isBlackjack(slice.house, ctx)) {
    const results = []
    for (const seat of punters(slice)) {
      if (slice.insured[seat]) stacks[seat] += slice.insured[seat] * 3
      for (const box of slice.boxes[seat]) {
        const push = isBlackjack(box.cards, ctx)
        if (push) stacks[seat] += box.bet
        results.push({ seat, outcome: push ? 'push' : 'lose' })
      }
    }
    return startRound({ ...slice, stacks, revealed: true, lastRound: { house: slice.house, results }, round: slice.round + 1 }, ctx)
  }
  // A player's Blackjack is paid at once.
  const boxes = slice.boxes.map((list, seat) => list.map(box => {
    if (seat === 0 || !isBlackjack(box.cards, ctx)) return box
    stacks[seat] += box.bet * 2.5
    return { ...box, done: true, outcome: 'blackjack' }
  }))
  return nextBox({ ...slice, stacks, boxes, phase: 'play', active: null }, ctx)
}

// The next box that still has a decision, or the house's turn.
function nextBox(slice, ctx) {
  for (const seat of punters(slice)) {
    const i = slice.boxes[seat].findIndex(b => !b.done)
    if (i >= 0) return { ...slice, active: { seat, box: i }, next: seat }
  }
  return housePlays(slice, ctx)
}

function housePlays(slice, ctx) {
  const s = settings(ctx)
  let next = { ...slice, revealed: true }
  const live = punters(next).some(seat => next.boxes[seat].some(b => !b.outcome))
  let house = [...next.house]
  if (live) {
    for (;;) {
      const t = total(house, ctx)
      if (t.value > 17 || (t.value === 17 && !(t.soft && s.hitSoft17))) break
      let card
      ;[card, next] = draw(next)
      house.push(card)
    }
  }
  const dealer = total(house, ctx).value
  const stacks = [...next.stacks]
  const results = []
  for (const seat of punters(next)) {
    for (const box of next.boxes[seat]) {
      if (box.outcome) { results.push({ seat, outcome: box.outcome }); continue }
      const mine = total(box.cards, ctx).value
      let outcome
      if (dealer > 21 || mine > dealer) { outcome = 'win'; stacks[seat] += box.bet * 2 } else if (mine === dealer) { outcome = 'push'; stacks[seat] += box.bet } else outcome = 'lose'
      results.push({ seat, outcome })
    }
  }
  return startRound({ ...next, house, stacks, lastRound: { house, results }, round: next.round + 1 }, ctx)
}

export const house = {
  init(base, ctx) {
    const { start } = chipSettings(ctx)
    const stacks = Array(ctx.seats).fill(start)
    stacks[0] = 0
    return startRound({ seed: ctx.seed || 1, round: 0, stacks, hands: Array.from({ length: ctx.seats }, () => []), community: [], drawPile: [], shoe: [], finished: null }, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  // The house never chooses.
  seatsThatChoose(slice) {
    return punters(slice)
  },

  legalMoves(slice, seat, ctx) {
    if (slice.phase === 'bet') return betsFor(slice.stacks[seat], ctx).map(b => ({ action: 'bet', value: String(b) }))
    if (slice.phase === 'insurance') return [{ action: 'insure' }, { action: 'decline' }]
    if (slice.phase !== 'play' || !slice.active || slice.active.seat !== seat) return []
    const box = slice.boxes[seat][slice.active.box]
    const out = [{ action: 'hit' }, { action: 'stand' }]
    const first = box.cards.length === 2 && !box.split
    if (first && slice.stacks[seat] >= box.bet) out.push({ action: 'double' })
    if (box.cards.length === 2 && !box.split && slice.boxes[seat].length === 1 && valueOfRank(box.cards[0], ctx) === valueOfRank(box.cards[1], ctx) && slice.stacks[seat] >= box.bet) out.push({ action: 'split' })
    if (first) out.push({ action: 'surrender' })
    return out
  },

  apply(move, slice, seat, ctx) {
    if (move.action === 'bet') {
      const bets = slice.bets.map((b, i) => (i === seat ? Number(move.value) : b))
      const stacks = slice.stacks.map((v, i) => (i === seat ? v - Number(move.value) : v))
      const waiting = punters(slice).filter(i => slice.stacks[i] > 0 && !bets[i])
      const next = { ...slice, bets, stacks }
      return waiting.length ? { ...next, next: waiting[0] } : deal(next, ctx)
    }
    if (move.action === 'insure' || move.action === 'decline') {
      const cost = move.action === 'insure' ? Math.floor(slice.bets[seat] / 2) : 0
      const next = { ...slice, insured: slice.insured.map((v, i) => (i === seat ? cost : v)), stacks: slice.stacks.map((v, i) => (i === seat ? v - cost : v)) }
      const rest = slice.asked.slice(slice.asked.indexOf(seat) + 1)
      return rest.length ? { ...next, next: rest[0] } : afterInsurance(next, ctx)
    }
    const at = slice.active.box
    let next = { ...slice, boxes: slice.boxes.map(list => list.map(b => ({ ...b, cards: [...b.cards] }))), stacks: [...slice.stacks] }
    const box = next.boxes[seat][at]
    const hit = () => { let card; [card, next] = draw(next); next.boxes[seat][at].cards.push(card) }
    if (move.action === 'hit') {
      hit()
      const t = total(next.boxes[seat][at].cards, ctx).value
      if (t > 21) next.boxes[seat][at] = { ...next.boxes[seat][at], done: true, outcome: 'bust' }
      else if (t === 21) next.boxes[seat][at].done = true
    } else if (move.action === 'stand') {
      box.done = true
    } else if (move.action === 'double') {
      next.stacks[seat] -= box.bet
      box.bet *= 2
      hit()
      const t = total(next.boxes[seat][at].cards, ctx).value
      next.boxes[seat][at] = { ...next.boxes[seat][at], done: true, ...(t > 21 ? { outcome: 'bust' } : {}) }
    } else if (move.action === 'surrender') {
      next.stacks[seat] += box.bet / 2
      next.boxes[seat][at] = { ...box, done: true, outcome: 'surrender' }
    } else if (move.action === 'split') {
      next.stacks[seat] -= box.bet
      const aces = ctx.card(box.cards[0]).rank === 'A'
      next.boxes[seat] = [{ cards: [box.cards[0]], bet: box.bet, done: false, split: true }, { cards: [box.cards[1]], bet: box.bet, done: false, split: true }]
      for (const k of [0, 1]) {
        let card
        ;[card, next] = draw(next)
        next.boxes[seat][k].cards.push(card)
        // Split Aces take one card each and nothing more.
        if (aces || total(next.boxes[seat][k].cards, ctx).value === 21) next.boxes[seat][k].done = true
      }
    }
    return nextBox(next, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  // Players' cards are dealt face up; the house's hole card and the shoe are hidden.
  project(slice) {
    return {
      ...slice,
      house: slice.house.map((id, i) => (i === 1 && !slice.revealed ? null : id)),
      shoe: slice.shoe.map(() => null),
    }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    const shown = view.house.filter(Boolean)
    if (view.house.length) {
      const t = view.revealed ? total(view.house, ctx).value : total(shown, ctx).value
      groups.push({ label: `${name(0)} ${view.revealed ? `has ${t}` : `shows ${t}`}`, cards: view.house })
    } else if (view.lastRound) {
      groups.push({ label: `Last round: ${name(0)} had ${total(view.lastRound.house, ctx).value} · ${view.lastRound.results.map(r => `${name(r.seat)} ${r.outcome}`).join(', ')}`, cards: view.lastRound.house })
    }
    for (const seat of punters(view)) {
      view.boxes[seat].forEach((box, k) => {
        const t = total(box.cards, ctx)
        const here = view.active && view.active.seat === seat && view.active.box === k ? ' ◀' : ''
        groups.push({ label: `${name(seat)} · bet ${box.bet} · ${t.soft ? 'soft ' : ''}${t.value}${box.outcome ? ` · ${box.outcome}` : ''}${here}`, cards: box.cards })
      })
    }
    if (view.phase === 'bet') groups.push({ label: 'Place your bets', cards: [] })
    return groups
  },

  describeSeat(view, seat) {
    if (seat === 0) return 'the house'
    return `${view.stacks[seat]} chips${view.bets[seat] ? ` · bet ${view.bets[seat]}` : ''}`
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return 'A tie on chips'
    return `${shown[slice.finished]} finishes with the most chips, ${slice.stacks[slice.finished]}`
  },

  // Basic strategy, simplified: split Aces and eights; double eleven, and
  // ten against a low card; stand on hard seventeen, or on twelve to sixteen
  // against the house's two to six; hit soft seventeen or less; never insure.
  policy(view, seat, moves, ctx) {
    const pick = (action) => moves.find(m => m.action === action)
    if (view.phase === 'bet') return moves[0]
    if (view.phase === 'insurance') return pick('decline')
    const box = view.boxes[seat][view.active.box]
    const up = valueOfRank(view.house[0], ctx)
    const t = total(box.cards, ctx)
    const rank = ctx.card(box.cards[0]).rank
    if (pick('split') && (rank === 'A' || rank === '8')) return pick('split')
    if (pick('double') && (t.value === 11 || (t.value === 10 && up <= 9))) return pick('double')
    if (t.soft) return t.value >= 18 ? pick('stand') : pick('hit')
    if (t.value >= 17) return pick('stand')
    if (t.value >= 12 && up <= 6) return pick('stand')
    return pick('hit')
  },

  describe(move) {
    return move.value ? `${move.action} ${move.value}` : move.action
  },
}
