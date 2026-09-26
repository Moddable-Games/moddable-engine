import { createRng } from '../../../../core/index.js'

// Partnership melds: Canasta (engine#184), from Pagat. Two partnerships meld
// cards of a rank together, with wild cards (jokers and twos) standing in, and
// a meld of seven is a canasta. A turn is to draw from the stock or take the
// whole discard pile, meld, and discard.
//
// "No meld can contain more than three wild cards", and a meld needs at least
// two natural cards. The pile may be taken with two natural cards of the top
// card's rank, one natural and one wild, or when the top card matches one of
// the partnership's melds; when it is frozen - it holds a wild card, or the
// partnership has not melded - only two naturals will do. A partnership's
// first melds must be worth a minimum that rises with its score. Red threes
// are laid out as they arrive and replaced; a black three stops the next
// player taking the pile. A player may go out only once their side has a
// canasta, "by melding all of your cards, or by melding all but one and
// discarding your last card." The game is played to a target score.
//
//     game: partnership-melds
//     partnerships: [[player1, player3], [player2, player4]]
//     values: { Joker: 50, A: 20, 2: 20, K: 10, ..., 4: 5, 3: 5 }
//     initialMeld: [{ below: 0, min: 15 }, { below: 1500, min: 50 }, { below: 3000, min: 90 }, { min: 120 }]
//     canasta: { size: 7, natural: 500, mixed: 300 }
//     redThree: { each: 100, all: 800 }
//     goingOut: { bonus: 100, concealed: 100 }
//     target: 5000

const isWild = (card) => card.rank === '2' || card.suit === 'joker'
const isThree = (card) => card.rank === '3'
const isRedThree = (card) => card.rank === '3' && (card.suit === 'hearts' || card.suit === 'diamonds')

function settings(ctx) {
  const c = ctx.config
  const names = ctx.names
  const seatOf = (n) => (typeof n === 'number' ? n : names.indexOf(n))
  const teams = (c.partnerships || [[0, 2], [1, 3]]).map(t => t.map(seatOf))
  return {
    teams,
    teamOf: (seat) => teams.findIndex(t => t.includes(seat)),
    values: { Joker: 50, A: 20, 2: 20, K: 10, Q: 10, J: 10, 10: 10, 9: 10, 8: 10, 7: 5, 6: 5, 5: 5, 4: 5, 3: 5, ...(c.values || {}) },
    initial: c.initialMeld || [{ below: 0, min: 15 }, { below: 1500, min: 50 }, { below: 3000, min: 90 }, { min: 120 }],
    canasta: { size: 7, natural: 500, mixed: 300, ...(c.canasta || {}) },
    redThree: { each: 100, all: 800, ...(c.redThree || {}) },
    out: { bonus: 100, concealed: 100, ...(c.goingOut || {}) },
    target: Number(c.target ?? 5000),
    each: Number(c.cardsEach ?? 11),
  }
}

function valueOf(ctx, id) {
  const card = ctx.card(id)
  const v = settings(ctx).values
  const key = card.suit === 'joker' ? 'Joker' : card.rank
  return Number(v[key] ?? 0)
}

const sum = (ids, ctx) => ids.reduce((n, id) => n + valueOf(ctx, id), 0)
const meldValue = (melds, ctx) => Object.values(melds).reduce((n, ids) => n + sum(ids, ctx), 0)

function minimumFor(score, s) {
  for (const step of s.initial) if (step.below === undefined || score < step.below) return Number(step.min)
  return 0
}

// A meld of one rank is legal if it has at least two naturals and no more than three wilds.
function legalMeld(ids, ctx) {
  const wild = ids.filter(id => isWild(ctx.card(id))).length
  const natural = ids.length - wild
  return ids.length >= 3 && natural >= 2 && wild <= 3
}

function isCanasta(ids, s) {
  return ids.length >= s.canasta.size
}

function subsets(list, min, max) {
  const out = []
  const n = list.length
  for (let mask = 0; mask < (1 << n); mask++) {
    const pick = list.filter((_, i) => mask & (1 << i))
    if (pick.length >= min && pick.length <= max) out.push(pick)
  }
  return out
}

// Draw a card, laying out any red three and drawing again.
function drawInto(slice, seat, ctx) {
  let stock = slice.stock
  let hand = slice.hands[seat]
  const red = slice.red.map(r => [...r])
  const team = settings(ctx).teamOf(seat)
  while (stock.length) {
    const [top, ...rest] = stock
    stock = rest
    if (isRedThree(ctx.card(top))) { red[team].push(top); continue }
    hand = [...hand, top]
    break
  }
  return { ...slice, stock, red, hands: slice.hands.map((h, i) => (i === seat ? hand : h)) }
}

function dealHand(slice, handNo, ctx) {
  const s = settings(ctx)
  const seats = ctx.seats
  const dealer = (seats - 1 + handNo) % seats
  let stock = createRng((slice.seed ^ Math.imul(handNo + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const hands = Array.from({ length: seats }, () => [])
  for (let k = 0; k < s.each; k++) for (let p = 1; p <= seats; p++) hands[(dealer + p) % seats].push(stock.shift())
  const red = [[], []]
  let next = { ...slice, hands, stock, red }
  // Red threes dealt are laid out and replaced.
  for (let seat = 0; seat < seats; seat++) {
    let reds = next.hands[seat].filter(id => isRedThree(ctx.card(id)))
    while (reds.length) {
      next = { ...next, hands: next.hands.map((h, i) => (i === seat ? h.filter(id => !reds.includes(id)) : h)), red: next.red.map((r, t) => (t === s.teamOf(seat) ? [...r, ...reds] : r)) }
      for (let k = 0; k < reds.length; k++) next = drawInto(next, seat, ctx)
      reds = next.hands[seat].filter(id => isRedThree(ctx.card(id)))
    }
  }
  // The up-card: "If this first face-up card is wild or a red three, another
  // card is turned and placed on top of it", which freezes the pile if wild.
  const pile = []
  stock = next.stock
  let frozen = false
  while (stock.length) {
    const top = stock.shift()
    pile.push(top)
    const card = ctx.card(top)
    if (isWild(card)) frozen = true
    if (!isWild(card) && !isRedThree(card)) break
  }
  return {
    ...next,
    stock,
    pile,
    frozen,
    hand: handNo,
    dealer,
    melds: [{}, {}],
    melded: [false, false],
    everMelded: Array(seats).fill(false),
    phase: 'draw',
    turn: null,
    next: (dealer + 1) % seats,
  }
}

function hasCanasta(melds, s) {
  return Object.values(melds).some(ids => isCanasta(ids, s))
}

// What the partnership could meld from this hand at best, for the initial minimum.
function bestInitial(hand, ctx, extraByRank = {}) {
  const byRank = new Map()
  const wilds = []
  for (const id of hand) {
    const card = ctx.card(id)
    if (isWild(card)) { wilds.push(id); continue }
    if (isThree(card)) continue
    if (!byRank.has(card.rank)) byRank.set(card.rank, [])
    byRank.get(card.rank).push(id)
  }
  for (const [rank, ids] of Object.entries(extraByRank)) byRank.set(rank, [...(byRank.get(rank) || []), ...ids])
  // A group of three naturals melds alone; a pair needs a wild to make three.
  // Wilds left over go where there is room, three to a meld at most.
  const pool = [...wilds].sort((a, b) => valueOf(ctx, b) - valueOf(ctx, a))
  let total = 0
  let room = 0
  const pairs = []
  for (const ids of byRank.values()) {
    if (ids.length >= 3) { total += sum(ids, ctx); room += 3 } else if (ids.length === 2) pairs.push(ids)
  }
  pairs.sort((a, b) => sum(b, ctx) - sum(a, ctx))
  for (const ids of pairs) {
    if (!pool.length) break
    total += sum(ids, ctx) + valueOf(ctx, pool.shift())
    room += 2
  }
  return total + sum(pool.slice(0, room), ctx)
}

function takeOptions(slice, seat, ctx) {
  const s = settings(ctx)
  if (!slice.pile.length) return null
  const topId = slice.pile[slice.pile.length - 1]
  const top = ctx.card(topId)
  if (isWild(top) || isThree(top)) return null
  const team = s.teamOf(seat)
  const hand = slice.hands[seat]
  const naturals = hand.filter(id => ctx.card(id).rank === top.rank && !isWild(ctx.card(id)))
  const wilds = hand.filter(id => isWild(ctx.card(id)))
  const frozen = slice.frozen || !slice.melded[team]
  let used = null
  if (naturals.length >= 2) used = naturals.slice(0, 2)
  else if (!frozen && slice.melds[team][top.rank]) used = []
  else if (!frozen && naturals.length === 1 && wilds.length) used = [naturals[0], wilds[0]]
  if (!used) return null
  // Taking the pile must leave a card to discard, unless the side can go out.
  if (slice.melded[team]) {
    const after = { ...slice.melds[team], [top.rank]: [...(slice.melds[team][top.rank] || []), ...used, topId] }
    const left = hand.length - used.length + slice.pile.length - 1
    if (left < 2 && !hasCanasta(after, s)) return null
  }
  if (!slice.melded[team]) {
    const min = minimumFor(slice.scores[team], s)
    const rest = hand.filter(id => !used.includes(id))
    const forced = sum([topId, ...used], ctx)
    if (forced + bestInitial(rest, ctx) < min) return null
  }
  return { top: topId, used }
}

function turnValue(slice, team, ctx) {
  return meldValue(slice.melds[team], ctx) - slice.turn.meldedAtStart
}

export const partnershipMelds = {
  init(base, ctx) {
    return dealHand({ seed: ctx.seed || 1, scores: [0, 0], finished: null, next: null, hands: base.hands }, 0, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    const s = settings(ctx)
    const team = s.teamOf(seat)
    if (slice.phase === 'draw') {
      const out = [{ action: 'draw' }]
      if (takeOptions(slice, seat, ctx)) out.push({ action: 'take' })
      return out
    }
    const hand = slice.hands[seat]
    const melds = slice.melds[team]
    const out = []
    const wilds = hand.filter(id => isWild(ctx.card(id)))
    const byRank = new Map()
    for (const id of hand) {
      const card = ctx.card(id)
      if (isWild(card) || isThree(card)) continue
      if (!byRank.has(card.rank)) byRank.set(card.rank, [])
      byRank.get(card.rank).push(id)
    }
    const canastaNow = hasCanasta(melds, s)
    // A meld must leave a card to discard, unless it takes the side out.
    const waiting = slice.turn?.pending?.length || 0
    const leaves = (cards, after) => {
      const left = hand.length - cards.length + waiting
      return left >= 2 || (left >= 0 && hasCanasta(after, s))
    }
    for (const [rank, naturals] of byRank) {
      const existing = melds[rank] || []
      const wildIn = existing.filter(id => isWild(ctx.card(id))).length
      const natPicks = subsets(naturals.length > 6 ? naturals.slice(0, 6) : naturals, existing.length ? 1 : 2, naturals.length)
      for (const nat of natPicks) {
        for (const wild of subsets(wilds, 0, Math.min(3 - wildIn, wilds.length))) {
          const cards = [...nat, ...wild]
          const whole = [...existing, ...cards]
          if (!legalMeld(whole, ctx)) continue
          const after = { ...melds, [rank]: whole }
          if (!leaves(cards, after)) continue
          out.push({ action: existing.length ? 'add' : 'meld', cards })
        }
      }
    }
    // Wild cards alone can be added to a meld that has room for them.
    for (const [rank, existing] of Object.entries(melds)) {
      if (byRank.has(rank)) continue
      const wildIn = existing.filter(id => isWild(ctx.card(id))).length
      for (const wild of subsets(wilds, 1, Math.min(3 - wildIn, wilds.length))) {
        const whole = [...existing, ...wild]
        if (!legalMeld(whole, ctx)) continue
        if (!leaves(wild, { ...melds, [rank]: whole })) continue
        out.push({ action: 'add', cards: wild, rank })
      }
    }
    // Black threes are melded only by a player going out.
    const blacks = hand.filter(id => isThree(ctx.card(id)) && !isRedThree(ctx.card(id)))
    if (blacks.length >= 3 && canastaNow && hand.length - blacks.length <= 1) out.push({ action: 'meld', cards: blacks })

    const unmelded = !slice.melded[team]
    const added = turnValue(slice, team, ctx)
    const min = minimumFor(slice.scores[team], s)
    const committed = !unmelded || added === 0 || added >= min
    if (unmelded && slice.turn.changed) out.push({ action: 'withdraw' })
    if (committed) {
      for (const id of hand) {
        if (hand.length === 1 && !canastaNow) continue
        out.push({ action: 'discard', cards: [id] })
      }
    }
    return out
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    const seats = ctx.seats
    const team = s.teamOf(seat)
    const startTurn = (next) => ({ ...next, phase: 'play', turn: { meldedAtStart: meldValue(next.melds[team], ctx), hand: next.hands[seat], melds: next.melds[team], pending: next.turn?.pending || [], tookPile: false, wasMelded: next.everMelded[seat] }, next: seat })

    if (move.action === 'draw') {
      // No stock to draw from ends the hand.
      if (!slice.stock.length) return endHand(slice, null, ctx)
      return startTurn(drawInto(slice, seat, ctx))
    }
    if (move.action === 'take') {
      const { top, used } = takeOptions(slice, seat, ctx)
      const rank = ctx.card(top).rank
      const hand = slice.hands[seat].filter(id => !used.includes(id))
      const melds = slice.melds.map((m, t) => (t === team ? { ...m, [rank]: [...(m[rank] || []), ...used, top] } : m))
      const rest = slice.pile.slice(0, -1)
      const unmelded = !slice.melded[team]
      // Before the side has melded, the rest of the pile joins the hand only
      // once the initial meld is made; the top card counts toward it.
      const next = { ...slice, pile: [], frozen: false, melds, hands: slice.hands.map((h, i) => (i === seat ? (unmelded ? hand : [...hand, ...rest]) : h)), everMelded: slice.everMelded.map((v, i) => (i === seat ? true : v)) }
      const started = startTurn(next)
      started.turn.meldedAtStart = meldValue(slice.melds[team], ctx)
      started.turn.tookPile = true
      started.turn.pending = unmelded ? rest : []
      return settlePending(started, seat, team, ctx)
    }
    if (move.action === 'withdraw') {
      // Back to the start of the turn, or to just after the pile was taken:
      // the top card and the cards that took it stay melded.
      return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? slice.turn.hand : h)), melds: slice.melds.map((m, t) => (t === team ? slice.turn.melds : m)), turn: { ...slice.turn, changed: false }, withdrew: true }
    }
    if (move.action === 'meld' || move.action === 'add') {
      const hand = slice.hands[seat].filter(id => !move.cards.includes(id))
      const naturals = move.cards.filter(id => !isWild(ctx.card(id)))
      const rank = move.rank || ctx.card(naturals[0]).rank
      const melds = slice.melds.map((m, t) => (t === team ? { ...m, [rank]: [...(m[rank] || []), ...move.cards] } : m))
      const next = { ...slice, hands: slice.hands.map((h, i) => (i === seat ? hand : h)), melds, everMelded: slice.everMelded.map((v, i) => (i === seat ? true : v)), turn: { ...slice.turn, changed: true } }
      const settled = settlePending(next, seat, team, ctx)
      if (!settled.hands[seat].length) return endHand(commit(settled, team, ctx), seat, ctx)
      return settled
    }
    // Discard.
    const id = move.cards[0]
    const card = ctx.card(id)
    const hand = slice.hands[seat].filter(x => x !== id)
    const next = commit({ ...slice, hands: slice.hands.map((h, i) => (i === seat ? hand : h)), pile: [...slice.pile, id], frozen: slice.frozen || isWild(card), withdrew: false }, team, ctx)
    if (!hand.length) return endHand(next, seat, ctx)
    return { ...next, phase: 'draw', turn: null, next: (seat + 1) % seats }
  },

  winner(slice) {
    return slice.finished
  },

  project(slice, seat) {
    return {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))),
      stock: slice.stock.map(() => null),
      turn: slice.turn && slice.next === seat ? slice.turn : null,
    }
  },

  table(view, ctx) {
    const s = settings(ctx)
    const name = (t) => s.teams[t].map(i => ctx.names[i] || `Player ${i + 1}`).join(' & ')
    const top = view.pile.slice(-1)
    const groups = [{ label: `Stock ${view.stock.length} · pile ${view.pile.length}${view.frozen ? ' (frozen)' : ''}`, cards: top, layout: 'pile' }]
    for (let t = 0; t < 2; t++) {
      const melds = Object.entries(view.melds[t])
      const cards = melds.flatMap(([, ids]) => ids)
      const canastas = melds.filter(([, ids]) => isCanasta(ids, s)).length
      if (cards.length || view.red[t].length) {
        groups.push({ label: `${name(t)} · ${melds.length} melds, ${canastas} canasta${canastas === 1 ? '' : 's'}${view.red[t].length ? ` · red threes ${view.red[t].length}` : ''}`, cards: [...view.red[t], ...cards] })
      }
    }
    return groups
  },

  describeSeat(view, seat, ctx) {
    const s = settings(ctx)
    const team = s.teamOf(seat)
    const parts = [`side ${view.scores[team]}`]
    if (!view.melded[team]) parts.push(`needs ${minimumFor(view.scores[team], s)} to meld`)
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const s = settings(ctx)
    const shown = ctx.displayNames || ctx.names
    const t = s.teamOf(slice.finished)
    return `${s.teams[t].map(i => shown[i]).join(' & ')} win, ${slice.scores[t]} to ${slice.scores[1 - t]}`
  },

  // Take the pile when allowed; meld the most valuable group; go out when the
  // side can; otherwise discard the loneliest cheap card, never a wild.
  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    const team = s.teamOf(seat)
    if (view.phase === 'draw') return moves.find(m => m.action === 'take') || moves[0]
    const worth = (m) => sum(m.cards, ctx) + m.cards.length
    const melding = moves.filter(m => m.action === 'meld' || m.action === 'add')
    const unmelded = !view.melded[team]
    if (view.withdrew) return discardOf(view, seat, moves, ctx) || moves[0]
    if (unmelded && view.turn && turnValue(view, team, ctx) === 0) {
      const reach = bestInitial(view.hands[seat], ctx)
      if (reach < minimumFor(view.scores[team], s)) return discardOf(view, seat, moves, ctx) || moves[0]
    }
    // For a first meld, lay natural groups before spending wild cards, so the
    // wilds are left to turn pairs into melds.
    const wildCount = (m) => m.cards.filter(id => isWild(ctx.card(id))).length
    if (melding.length && unmelded) return melding.reduce((a, b) => (wildCount(b) < wildCount(a) || (wildCount(b) === wildCount(a) && worth(b) > worth(a)) ? b : a))
    if (melding.length) return melding.reduce((a, b) => (worth(b) > worth(a) ? b : a))
    const withdraw = moves.find(m => m.action === 'withdraw')
    if (withdraw && !moves.some(m => m.action === 'discard')) return withdraw
    return discardOf(view, seat, moves, ctx) || withdraw || moves[0]
  },

  describe(move, ctx) {
    const cards = (move.cards || []).map(id => ctx.card(id)?.display || id).join(' ')
    if (move.action === 'draw') return 'draws'
    if (move.action === 'take') return 'takes the pile'
    if (move.action === 'withdraw') return 'takes back the melds'
    if (move.action === 'discard') return `discards ${cards}`
    return `${move.action}s ${cards}`
  },
}

function discardOf(view, seat, moves, ctx) {
  const hand = view.hands[seat]
  const discards = moves.filter(m => m.action === 'discard')
  if (!discards.length) return null
  const count = (id) => hand.filter(o => ctx.card(o).rank === ctx.card(id).rank).length
  const cost = (m) => {
    const card = ctx.card(m.cards[0])
    if (isWild(card)) return 1000
    if (isThree(card)) return -10
    return count(m.cards[0]) * 50 + valueOf(ctx, m.cards[0])
  }
  return discards.reduce((a, b) => (cost(b) < cost(a) ? b : a))
}

// The side's first melds are made once they reach the minimum; the rest of a
// pile taken for them then joins the hand.
function settlePending(slice, seat, team, ctx) {
  if (slice.melded[team]) return slice
  const s = settings(ctx)
  if (turnValue(slice, team, ctx) < minimumFor(slice.scores[team], s)) return slice
  return {
    ...slice,
    melded: slice.melded.map((v, t) => (t === team ? true : v)),
    hands: slice.hands.map((h, i) => (i === seat ? [...h, ...(slice.turn.pending || [])] : h)),
    turn: { ...slice.turn, pending: [] },
  }
}

function commit(slice, team, ctx) {
  return settlePending(slice, slice.next, team, ctx)
}

function endHand(slice, outSeat, ctx) {
  const s = settings(ctx)
  const scores = [...slice.scores]
  const detail = [0, 1].map(t => {
    const melds = Object.values(slice.melds[t])
    let score = melds.reduce((n, ids) => n + sum(ids, ctx), 0)
    for (const ids of melds) {
      if (!isCanasta(ids, s)) continue
      score += ids.some(id => isWild(ctx.card(id))) ? s.canasta.mixed : s.canasta.natural
    }
    const reds = slice.red[t].length
    const redValue = reds === 4 ? s.redThree.all : reds * s.redThree.each
    score += slice.melded[t] ? redValue : -redValue
    if (outSeat !== null && s.teamOf(outSeat) === t) {
      score += s.out.bonus
      if (slice.turn && !slice.turn.wasMelded) score += s.out.concealed
    }
    for (const seat of s.teams[t]) score -= sum(slice.hands[seat], ctx)
    return score
  })
  detail.forEach((d, t) => { scores[t] += d })
  const lastHand = { scores: detail, out: outSeat }
  if (Math.max(...scores) >= s.target && scores[0] !== scores[1]) {
    const t = scores[0] > scores[1] ? 0 : 1
    return { ...slice, scores, lastHand, phase: 'over', finished: s.teams[t][0], winningSide: t, next: null }
  }
  return dealHand({ ...slice, scores, lastHand }, slice.hand + 1, ctx)
}
