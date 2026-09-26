import { createRng } from '../../../../core/index.js'
import { chipSettings, richest } from './chips.js'

// Tableaus: Oicho-Kabu (engine#184), from the English and Japanese Wikipedia.
// Forty cards, January to October, each worth its month, a hand worth the last
// digit of its total. "Four cards are placed face-up on the table forming four
// tableaus", the dealer takes one face down, and the players bet on the
// tableaus. Each tableau is dealt a second card; a total of 3 or less must
// draw a third, 7 or more may not, and between them the tableau's first
// bettor decides. The dealer then plays the same way. The hand closest to 9
// wins, a tie going to the dealer.
//
//   Kuppin   the dealer's first two cards 9 and 1: the dealer wins, double.
//   Shippin  a tableau's first two cards 4 and 1: the tableau wins, double.
//   Arashi   three cards of one value: triple.
//
//     game: tableaus
//     chips: { start: 100, bets: [1, 2, 5, 10] }
//     rounds: 8

const valueOf = (ctx, id) => ctx.card(id).monthIndex + 1
const total = (ids, ctx) => ids.reduce((n, id) => n + valueOf(ctx, id), 0) % 10
const pair = (ids, ctx, a, b) => ids.length === 2 && [valueOf(ctx, ids[0]), valueOf(ctx, ids[1])].sort((x, y) => x - y).join() === [a, b].sort((x, y) => x - y).join()
const arashi = (ids, ctx) => ids.length === 3 && ids.every(id => valueOf(ctx, id) === valueOf(ctx, ids[0]))

function draws(ids, ctx) {
  const t = total(ids, ctx)
  if (ids.length >= 3) return 'no'
  if (t <= 3) return 'must'
  if (t >= 7) return ids.every(id => valueOf(ctx, id) === 9) ? 'may' : 'no'
  return 'may'
}

function startRound(slice, ctx) {
  const rounds = Number(ctx.config.rounds ?? 8) || 8
  const seats = slice.stacks.length
  if (slice.round >= rounds) return { ...slice, phase: 'over', finished: richest(slice.stacks, slice.stacks.map((_, i) => i)), next: null }
  const dealer = slice.round % seats
  const deck = createRng((slice.seed ^ Math.imul(slice.round + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const tableaus = [0, 1, 2, 3].map(() => ({ cards: [deck.shift()], bets: [] }))
  const own = [deck.shift()]
  const punters = []
  for (let k = 1; k < seats; k++) punters.push((dealer + k) % seats)
  return { ...slice, dealer, deck, tableaus, own, punters, phase: 'bet', deciding: null, next: punters[0] }
}

// Second cards; then the third-card decisions, tableau by tableau.
function dealSeconds(slice, ctx) {
  let deck = [...slice.deck]
  const tableaus = slice.tableaus.map(t => (t.bets.length ? { ...t, cards: [...t.cards, deck.shift()] } : t))
  return nextDecision({ ...slice, deck, tableaus }, 0, ctx)
}

function nextDecision(slice, from, ctx) {
  let deck = [...slice.deck]
  const tableaus = slice.tableaus.map(t => ({ ...t, cards: [...t.cards] }))
  for (let i = from; i < 4; i++) {
    const t = tableaus[i]
    if (!t.bets.length || t.done) continue
    if (pair(t.cards, ctx, 4, 1)) { t.done = true; continue }
    const rule = draws(t.cards, ctx)
    if (rule === 'must') { t.cards.push(deck.shift()); t.done = true; continue }
    if (rule === 'no') { t.done = true; continue }
    return { ...slice, deck, tableaus, phase: 'third', deciding: i, next: t.bets[0].seat }
  }
  return dealerPlays({ ...slice, deck, tableaus, deciding: null }, ctx)
}

function dealerPlays(slice, ctx) {
  const deck = [...slice.deck]
  const own = [...slice.own, deck.shift()]
  const next = { ...slice, deck, own }
  if (pair(own, ctx, 9, 1)) return settle(next, ctx)
  const rule = draws(own, ctx)
  if (rule === 'must') return settle({ ...next, own: [...own, deck.shift()] }, ctx)
  if (rule === 'no') return settle(next, ctx)
  return { ...next, phase: 'dealer', next: slice.dealer }
}

function settle(slice, ctx) {
  const stacks = [...slice.stacks]
  const d = slice.dealer
  const kuppin = pair(slice.own, ctx, 9, 1)
  const dealerTotal = total(slice.own, ctx)
  const results = slice.tableaus.map((t, i) => {
    if (!t.bets.length) return null
    let win, mult = 1
    if (kuppin) { win = false; mult = 2 } else if (pair(t.cards, ctx, 4, 1)) { win = true; mult = 2 } else {
      const mine = total(t.cards, ctx)
      win = mine > dealerTotal
      if (win && arashi(t.cards, ctx)) mult = 3
      if (!win && arashi(slice.own, ctx)) mult = 3
    }
    for (const { seat, amount } of t.bets) {
      const pay = amount * mult
      stacks[seat] += win ? pay : -pay
      stacks[d] += win ? -pay : pay
    }
    return { tableau: i + 1, total: total(t.cards, ctx), win, mult }
  })
  return startRound({ ...slice, stacks, lastRound: { dealer: d, own: slice.own, dealerTotal, kuppin, results: results.filter(Boolean) }, round: slice.round + 1 }, ctx)
}

export const tableaus = {
  init(base, ctx) {
    const { start } = chipSettings(ctx)
    return startRound({ seed: ctx.seed || 1, round: 0, stacks: Array(ctx.seats).fill(start), hands: Array.from({ length: ctx.seats }, () => []), community: [], drawPile: [], finished: null }, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    if (slice.phase === 'bet') {
      const bets = chipSettings(ctx).bets.filter(b => b <= Math.max(0, slice.stacks[seat]))
      const out = []
      for (let t = 1; t <= 4; t++) for (const b of bets) out.push({ action: 'bet', value: `${t} for ${b}` })
      out.push({ action: 'skip' })
      return out
    }
    if (slice.phase === 'third' || slice.phase === 'dealer') return [{ action: 'draw' }, { action: 'stand' }]
    return []
  },

  apply(move, slice, seat, ctx) {
    if (slice.phase === 'bet') {
      let next = slice
      if (move.action === 'bet') {
        const [t, , amount] = String(move.value).split(' ')
        next = { ...slice, tableaus: slice.tableaus.map((tb, i) => (i === Number(t) - 1 ? { ...tb, bets: [...tb.bets, { seat, amount: Number(amount) }] } : tb)) }
      }
      const rest = slice.punters.slice(slice.punters.indexOf(seat) + 1)
      return rest.length ? { ...next, next: rest[0] } : dealSeconds(next, ctx)
    }
    if (slice.phase === 'third') {
      const i = slice.deciding
      const deck = [...slice.deck]
      const tableaus = slice.tableaus.map((t, k) => (k === i ? { ...t, cards: move.action === 'draw' ? [...t.cards, deck.shift()] : t.cards, done: true } : t))
      return nextDecision({ ...slice, deck, tableaus }, i + 1, ctx)
    }
    // The dealer's third card.
    const deck = [...slice.deck]
    return settle({ ...slice, deck, own: move.action === 'draw' ? [...slice.own, deck.shift()] : slice.own }, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  // The dealer's card is face down until the dealer plays; the deck is hidden.
  project(slice) {
    const shown = slice.phase === 'dealer' || slice.phase === 'over'
    return { ...slice, own: slice.own.map((id, i) => (i === 0 && !shown ? null : id)), deck: slice.deck.map(() => null) }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = [{ label: `${name(view.dealer)} deals${view.own.every(Boolean) ? ` · ${total(view.own, ctx)}` : ''}`, cards: view.own }]
    view.tableaus.forEach((t, i) => {
      const bets = t.bets.map(b => `${name(b.seat)} ${b.amount}`).join(', ')
      groups.push({ label: `Tableau ${i + 1} · ${total(t.cards, ctx)}${bets ? ` · ${bets}` : ''}${view.deciding === i ? ' ◀' : ''}`, cards: t.cards })
    })
    if (view.lastRound) {
      const r = view.lastRound
      groups.push({ label: `Last deal: ${name(r.dealer)} ${r.kuppin ? 'kuppin' : r.dealerTotal} · ${r.results.map(x => `${x.tableau}: ${x.win ? 'won' : 'lost'}${x.mult > 1 ? ` ×${x.mult}` : ''}`).join(', ')}`, cards: [] })
    }
    return groups
  },

  describeSeat(view, seat) {
    return `${view.stacks[seat]} chips${seat === view.dealer ? ' · dealer' : ''}`
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return 'A tie on chips'
    return `${shown[slice.finished]} finishes with the most chips, ${slice.stacks[slice.finished]}`
  },

  // Back a tableau showing a middling card with the smallest stake; draw on
  // 4 and 5, stand on 6.
  policy(view, seat, moves, ctx, random) {
    if (view.phase === 'bet') {
      const bets = moves.filter(m => m.action === 'bet')
      if (!bets.length) return moves[moves.length - 1]
      const t = 1 + Math.floor((random ? random() : 0) * 4)
      return bets.find(m => m.value.startsWith(`${t} for`)) || bets[0]
    }
    const cards = view.phase === 'dealer' ? view.own : view.tableaus[view.deciding].cards
    return total(cards.filter(Boolean), ctx) <= 5 ? moves.find(m => m.action === 'draw') : moves.find(m => m.action === 'stand')
  },

  describe(move) {
    return move.value ? `${move.action} ${move.value}` : move.action
  },
}
