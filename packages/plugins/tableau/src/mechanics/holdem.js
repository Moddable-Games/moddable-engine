import { createRng } from '../../../../core/index.js'
import { chipSettings } from './chips.js'

// Holdem: Texas Hold'em (engine#184), from its page, for play chips. Each
// player has two hole cards and shares five community cards; "the player with
// the best five-card hand wins the pot". The small and big blinds are posted
// left of the button; betting runs preflop, on the flop, the turn and the
// river, and a player may fold, check, call or raise. No-limit: a raise may be
// anything up to all a player has, and "side pots are created for any
// additional bets among players who still have chips". The last player with
// chips wins; blinds rise on a schedule.
//
//     game: holdem
//     chips: { start: 1000 }
//     blinds: { small: 10, big: 20, doubleEvery: 10 }

const RANKS = { J: 11, Q: 12, K: 13, A: 14 }
const rankOf = (card) => RANKS[card.rank] ?? Number(card.rank)

// A five-card hand's strength: category first, then the ranks that decide it.
// Categories: 0 high card, 1 pair, 2 two pair, 3 three of a kind, 4 straight,
// 5 flush, 6 full house, 7 four of a kind, 8 straight flush.
function rankFive(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const flush = cards.every(c => c.suit === cards[0].suit)
  const distinct = [...new Set(ranks)]
  let straightHigh = 0
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0]
    else if (distinct.join() === '14,5,4,3,2') straightHigh = 5
  }
  const counts = new Map()
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const byGroup = groups.map(g => g[0])
  if (straightHigh && flush) return [8, straightHigh]
  if (groups[0][1] === 4) return [7, ...byGroup]
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...byGroup]
  if (flush) return [5, ...ranks]
  if (straightHigh) return [4, straightHigh]
  if (groups[0][1] === 3) return [3, ...byGroup]
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroup]
  if (groups[0][1] === 2) return [1, ...byGroup]
  return [0, ...ranks]
}

const compare = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  return 0
}

function fives(list, start = 0, prefix = [], out = []) {
  if (prefix.length === 5) { out.push(prefix); return out }
  for (let i = start; i <= list.length - (5 - prefix.length); i++) fives(list, i + 1, [...prefix, list[i]], out)
  return out
}

// The best five of the cards a player can use: five, six or seven of them.
export function bestHand(ids, ctx) {
  let best = null
  for (const five of fives(ids.map(id => ctx.card(id)))) {
    const r = rankFive(five)
    if (!best || compare(r, best) > 0) best = r
  }
  return best
}

const CATEGORY = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'flush', 'full house', 'four of a kind', 'straight flush']

function blindsFor(slice, ctx) {
  const b = ctx.config.blinds || {}
  const every = Number(b.doubleEvery ?? 10)
  const factor = every > 0 ? 2 ** Math.floor(slice.hand / every) : 1
  return { small: Number(b.small ?? 10) * factor, big: Number(b.big ?? 20) * factor }
}

const alive = (slice) => slice.stacks.map((_, i) => i).filter(i => slice.inHand[i] && !slice.folded[i])
const canAct = (slice, seat) => slice.inHand[seat] && !slice.folded[seat] && slice.stacks[seat] > 0

function nextFrom(slice, from, test) {
  const n = slice.stacks.length
  for (let k = 1; k <= n; k++) { const s = (from + k) % n; if (test(s)) return s }
  return null
}

function dealHand(slice, ctx) {
  const n = slice.stacks.length
  const inHand = slice.stacks.map(v => v > 0)
  if (inHand.filter(Boolean).length <= 1) return { ...slice, phase: 'over', finished: inHand.indexOf(true), next: null }
  const button = slice.hand === 0 ? inHand.indexOf(true) : nextFrom({ ...slice, inHand }, slice.button, s => inHand[s])
  const deck = createRng((slice.seed ^ Math.imul(slice.hand + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const hands = Array.from({ length: n }, () => [])
  for (let k = 0; k < 2; k++) for (let p = 1; p <= n; p++) { const s = (button + p) % n; if (inHand[s]) hands[s].push(deck.shift()) }
  // The five community cards, face down until their street.
  const toCome = deck.splice(0, 5)
  const { small, big } = blindsFor(slice, ctx)
  const players = inHand.filter(Boolean).length
  // Heads up, the button posts the small blind and acts first before the flop.
  const sb = players === 2 ? button : nextFrom({ ...slice, inHand }, button, s => inHand[s])
  const bb = nextFrom({ ...slice, inHand }, sb, s => inHand[s])
  let next = { ...slice, button, inHand, hands, toCome, community: [], drawPile: [], folded: Array(n).fill(false), committed: Array(n).fill(0), total: Array(n).fill(0), street: 0, bigBlind: big }
  const post = (s, amount) => {
    const paid = Math.min(amount, next.stacks[s])
    next.stacks = next.stacks.map((v, i) => (i === s ? v - paid : v))
    next.committed = next.committed.map((v, i) => (i === s ? v + paid : v))
    next.total = next.total.map((v, i) => (i === s ? v + paid : v))
  }
  post(sb, small)
  post(bb, big)
  const first = nextFrom(next, bb, s => canAct(next, s))
  return { ...next, phase: 'bet', currentBet: big, lastRaise: big, acted: Array(n).fill(false), next: first ?? bb }
}

// The street is over: everyone still in has acted and matched, or cannot.
function streetDone(slice) {
  const live = alive(slice)
  if (live.length <= 1) return true
  const toMatch = live.filter(s => slice.stacks[s] > 0)
  return toMatch.every(s => slice.acted[s] && slice.committed[s] === slice.currentBet)
}

function advance(slice, ctx) {
  const live = alive(slice)
  if (live.length === 1) return award(slice, [[live[0]]], ctx)
  const street = slice.street + 1
  if (street > 3) return showdown(slice, ctx)
  const community = slice.toCome.slice(0, street === 1 ? 3 : street + 2)
  const n = slice.stacks.length
  let next = { ...slice, street, community, committed: Array(n).fill(0), currentBet: 0, lastRaise: slice.bigBlind, acted: Array(n).fill(false) }
  // With one player or none left able to bet, the rest of the board is dealt.
  if (live.filter(s => next.stacks[s] > 0).length <= 1) return advance(next, ctx)
  const first = nextFrom(next, slice.button, s => canAct(next, s))
  return { ...next, next: first }
}

function showdown(slice, ctx) {
  const live = alive(slice)
  const strength = new Map(live.map(s => [s, bestHand([...slice.hands[s], ...slice.toCome], ctx)]))
  const order = [...live].sort((a, b) => compare(strength.get(b), strength.get(a)))
  const tiers = []
  for (const s of order) {
    const last = tiers[tiers.length - 1]
    if (last && compare(strength.get(last[0]), strength.get(s)) === 0) last.push(s)
    else tiers.push([s])
  }
  return award({ ...slice, community: slice.toCome, shown: live.map(s => ({ seat: s, hand: CATEGORY[strength.get(s)[0]] })) }, tiers, ctx)
}

// Pay each pot, main and side, to the best hand that contributed to it.
function award(slice, tiers, ctx) {
  const stacks = [...slice.stacks]
  const levels = [...new Set(slice.total.filter(v => v > 0))].sort((a, b) => a - b)
  let floor = 0
  const winners = new Set()
  for (const level of levels) {
    const contributors = slice.total.map((v, i) => i).filter(i => slice.total[i] >= level)
    const pot = contributors.length * (level - floor)
    const eligible = contributors.filter(i => !slice.folded[i] && slice.inHand[i])
    const tier = tiers.find(t => t.some(s => eligible.includes(s)))
    const takers = tier ? tier.filter(s => eligible.includes(s)) : eligible
    if (takers.length) {
      const share = Math.floor(pot / takers.length)
      takers.forEach((s, k) => { stacks[s] += share + (k === 0 ? pot - share * takers.length : 0); winners.add(s) })
    } else {
      // Nobody still in the hand matched this much: it was never called, and goes back.
      for (const s of contributors) stacks[s] += level - floor
    }
    floor = level
  }
  const next = { ...slice, stacks, lastHand: { winners: [...winners], shown: slice.shown || null, board: slice.community }, hand: slice.hand + 1, shown: null }
  return dealHand(next, ctx)
}

export const holdem = {
  init(base, ctx) {
    const { start } = chipSettings(ctx)
    return dealHand({ seed: ctx.seed || 1, hand: 0, button: 0, stacks: Array(ctx.seats).fill(start), finished: null }, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat) {
    if (slice.phase !== 'bet') return []
    const owe = slice.currentBet - slice.committed[seat]
    const stack = slice.stacks[seat]
    const out = []
    if (owe > 0) out.push({ action: 'fold' }, { action: 'call' })
    else out.push({ action: 'check' })
    // Raises to: the least allowed, steps of the big blind, and all in.
    const most = slice.committed[seat] + stack
    const least = slice.currentBet + slice.lastRaise
    if (most > slice.currentBet) {
      const tos = new Set()
      for (let k = 0; k < 10; k++) { const to = least + k * slice.bigBlind; if (to < most) tos.add(to) }
      tos.add(most)
      for (const to of [...tos].sort((a, b) => a - b)) out.push({ action: 'raise', value: `to ${to}` })
    }
    return out
  },

  apply(move, slice, seat, ctx) {
    let next = { ...slice, acted: slice.acted.map((v, i) => (i === seat ? true : v)) }
    const pay = (amount) => {
      const paid = Math.min(amount, next.stacks[seat])
      next.stacks = next.stacks.map((v, i) => (i === seat ? v - paid : v))
      next.committed = next.committed.map((v, i) => (i === seat ? v + paid : v))
      next.total = next.total.map((v, i) => (i === seat ? v + paid : v))
    }
    if (move.action === 'fold') next.folded = next.folded.map((v, i) => (i === seat ? true : v))
    if (move.action === 'call') pay(slice.currentBet - slice.committed[seat])
    if (move.action === 'raise') {
      const to = Number(String(move.value).replace('to ', ''))
      pay(to - slice.committed[seat])
      const raisedTo = next.committed[seat]
      if (raisedTo > slice.currentBet) {
        next.lastRaise = Math.max(slice.lastRaise, raisedTo - slice.currentBet)
        next.currentBet = raisedTo
        // A raise reopens the betting to everyone else.
        next.acted = next.acted.map((v, i) => (i === seat ? true : false))
      }
    }
    if (streetDone(next)) return advance(next, ctx)
    const following = nextFrom(next, seat, s => canAct(next, s))
    return { ...next, next: following ?? seat }
  },

  winner(slice) {
    return slice.finished
  },

  // Hole cards are private; the board shows only what has been dealt.
  project(slice, seat) {
    return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))), toCome: slice.toCome.map(() => null) }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const pot = view.total.reduce((a, b) => a + b, 0)
    const street = ['Preflop', 'Flop', 'Turn', 'River'][view.street]
    const groups = [{ label: `${street} · pot ${pot} · to call ${view.currentBet} · button ${name(view.button)}`, cards: view.community }]
    if (view.lastHand) {
      const shown = view.lastHand.shown ? ` (${view.lastHand.shown.map(x => `${name(x.seat)} ${x.hand}`).join(', ')})` : ''
      groups.push({ label: `Last hand to ${view.lastHand.winners.map(name).join(' & ')}${shown}`, cards: [] })
    }
    return groups
  },

  describeSeat(view, seat) {
    if (!view.inHand[seat]) return view.stacks[seat] > 0 ? `${view.stacks[seat]} chips` : 'out'
    const parts = [`${view.stacks[seat]} chips`]
    if (view.committed[seat]) parts.push(`in ${view.committed[seat]}`)
    if (view.folded[seat]) parts.push('folded')
    else if (view.stacks[seat] === 0) parts.push('all in')
    if (seat === view.button) parts.push('button')
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    return `${shown[slice.finished]} wins every chip`
  },

  // Play what the cards are worth: raise with two pair or better, or a high
  // pair before the flop; call with a pair or a big card; otherwise check,
  // or fold to a bet.
  policy(view, seat, moves, ctx) {
    const pick = (action) => moves.find(m => m.action === action)
    const hole = view.hands[seat]
    let strength
    if (view.street === 0) {
      const [a, b] = hole.map(id => rankOf(ctx.card(id)))
      strength = a === b ? (a >= 10 ? 3 : 2) : Math.max(a, b) >= 13 ? 1 : 0
    } else {
      const cat = bestHand([...hole, ...view.community], ctx)[0]
      strength = cat >= 2 ? 3 : cat === 1 ? 2 : 0
    }
    const raises = moves.filter(m => m.action === 'raise')
    if (strength >= 3 && raises.length && view.currentBet <= view.bigBlind * 4) return raises[0]
    if (strength >= 1) return pick('call') || pick('check')
    return pick('check') || pick('fold')
  },

  describe(move) {
    return move.value ? `${move.action}s ${move.value}` : `${move.action}s`
  },
}
