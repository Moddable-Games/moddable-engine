import { createRng } from '../../../../core/index.js'
import { kindOf, parseKind, isBonus, arrangements, isSevenPairs, isThirteenOrphans } from './mahjong-hands.js'
import { SCORERS } from './mahjong-scoring.js'

// Wall: mahjong (engine#184). Four players draw from a wall and discard. A
// discard may be claimed out of turn: "Win (any player)", then "Kong",
// "Pong", then "Chow (left-hand player only)", and "only one player may claim
// each discard". A kong draws a supplement tile; a pung added to by the fourth
// tile may be robbed by a player who wins on it. Flowers and seasons are set
// aside and replaced. A hand is four sets and a pair, or seven pairs, or
// thirteen orphans; the game's scorer values it, and a hand below the minimum
// may not be declared. The dealer keeps the deal on a win or a drawn hand.
//
//     game: wall
//     scoring: hong-kong
//     minimum: 3
//     rounds: 1                # wind rounds: every seat deals once in each
//     handSize: 13             # 16 for five sets and a pair
//     multipleWinners: false   # several players may win on one discard
//     tai: { ... }             # a scorer's table, where the game declares one

const WINDS = ['east', 'south', 'west', 'north']

function settings(ctx) {
  const c = ctx.config
  const game = SCORERS[c.scoring || 'hong-kong']
  const handSize = Number(c.handSize ?? 13)
  return {
    game,
    scorer: (hand) => game.score(hand, c.tai || {}),
    minimum: Number(c.minimum ?? 3),
    rounds: Number(c.rounds ?? 1) || 1,
    handSize,
    sets: (handSize - 1) / 3,
    multipleWinners: !!c.multipleWinners,
  }
}

const tileOf = (ctx, id) => ctx.card(id)
const kinds = (ids, ctx) => ids.map(id => kindOf(tileOf(ctx, id)))
const seatWind = (slice, seat) => WINDS[(seat - slice.dealer + 4) % 4]

// Take tiles from the wall, setting bonus tiles aside and drawing again.
function drawFor(slice, seat, ctx, fromBack = false) {
  let wall = [...slice.wall]
  const bonus = slice.bonus.map(b => [...b])
  let tile = null
  while (wall.length) {
    const t = fromBack ? wall.pop() : wall.shift()
    if (isBonus(tileOf(ctx, t))) { bonus[seat].push(t); fromBack = true; continue }
    tile = t
    break
  }
  if (tile === null) return null
  return { ...slice, wall, bonus, hands: slice.hands.map((h, i) => (i === seat ? [...h, tile] : h)), drawn: tile }
}

function deal(slice, ctx) {
  const wall = createRng((slice.seed ^ Math.imul(slice.deals + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  let next = { ...slice, deals: slice.deals + 1, wall, hands: [[], [], [], []], melds: [[], [], [], []], discards: [[], [], [], []], bonus: [[], [], [], []], lastDiscard: null, claim: null, drawn: null, flags: {} }
  const { handSize } = settings(ctx)
  for (let k = 0; k < handSize; k++) for (let p = 0; p < 4; p++) next = drawFor(next, (next.dealer + p) % 4, ctx)
  return startTurn({ ...next, phase: 'discard' }, next.dealer, ctx, false)
}

// A turn begins with a draw from the wall; an empty wall is a drawn hand.
function startTurn(slice, seat, ctx, afterKong) {
  const drew = drawFor(slice, seat, ctx, afterKong)
  if (!drew) return endHand({ ...slice, lastHand: { drawn: true } }, null, ctx)
  return { ...drew, phase: 'discard', next: seat, flags: { selfDrawn: true, afterKong, lastTile: !drew.wall.length } }
}

// The best value of this seat's hand with these concealed tiles, or null.
function valueHand(slice, seat, concealedIds, how, ctx) {
  const s = settings(ctx)
  const exposed = slice.melds[seat]
  const concealedKinds = kinds(concealedIds, ctx)
  const allKinds = [...concealedKinds, ...exposed.flatMap(m => kinds(m.tiles, ctx))]
  const base = {
    kinds: allKinds,
    bonus: slice.bonus[seat].map(id => tileOf(ctx, id)),
    seatWind: seatWind(slice, seat),
    roundWind: WINDS[slice.roundWind],
    seat,
    concealed: exposed.every(m => !m.open),
    ...how,
  }
  const readings = []
  if (s.game.specials && !exposed.length && isThirteenOrphans(concealedKinds)) readings.push({ ...base, sets: [], pair: null, special: 'thirteen-orphans' })
  if (s.game.specials && !exposed.length && isSevenPairs(concealedKinds)) readings.push({ ...base, sets: [], pair: null, special: 'seven-pairs' })
  const openSets = exposed.map(m => ({ type: m.type, kind: m.kind, open: m.open }))
  for (const a of arrangements(concealedKinds, s.sets - exposed.length)) {
    // Won on a discard, a pung that took the winning tile counts as open.
    const sets = a.sets.map(x => ({ ...x, open: !how.selfDrawn && x.type === 'pung' && x.kind === how.winning && a.pair !== how.winning }))
    readings.push({ ...base, sets: [...openSets, ...sets], pair: a.pair, special: null })
  }
  let best = null
  for (const r of readings) {
    const v = s.scorer(r)
    if (!best || v.value > best.value) best = v
  }
  return best && best.value >= s.minimum ? best : null
}

function nextSeat(seat) {
  return (seat + 1) % 4
}

function endHand(slice, winner, ctx, payment = null) {
  const s = settings(ctx)
  const scores = [...slice.scores]
  if (payment) payment.forEach((v, i) => { scores[i] += v })
  // The dealer keeps the deal on a win or a drawn hand; otherwise it passes on,
  // and the wind round moves on once every seat has dealt.
  let dealer = slice.dealer
  let roundWind = slice.roundWind
  if (winner !== null && winner !== slice.dealer) {
    dealer = nextSeat(slice.dealer)
    if (dealer === slice.firstDealer) roundWind++
  }
  const next = { ...slice, scores, dealer, roundWind, lastHand: slice.lastHand }
  if (roundWind >= s.rounds) {
    const top = Math.max(...scores)
    const leaders = scores.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0)
    return { ...next, phase: 'over', finished: leaders.length === 1 ? leaders[0] : 'draw', next: null }
  }
  return deal(next, ctx)
}

// Pay one or more winners: on a self-drawn win every other player pays, on a
// discard the discarder pays each winner. Where the game says so, a payment
// the dealer makes or receives is doubled.
function win(slice, winners, from, ctx) {
  const { game } = settings(ctx)
  const payment = [0, 0, 0, 0]
  const hands = []
  for (const { seat, value } of winners) {
    const points = game.points(value.value)
    const pay = (payer) => {
      const amount = points * (from === null ? game.selfDraw : 1) * (game.dealerDouble && (payer === slice.dealer || seat === slice.dealer) ? 2 : 1)
      payment[payer] -= amount
      payment[seat] += amount
    }
    if (from === null) { for (let i = 0; i < 4; i++) if (i !== seat) pay(i) } else pay(from)
    hands.push({ winner: seat, value: value.value, patterns: value.patterns, points })
  }
  const keeps = winners.some(w => w.seat === slice.dealer) ? slice.dealer : winners[0].seat
  return endHand({ ...slice, lastHand: { ...hands[0], from, winners: hands } }, keeps, ctx, payment)
}

// After a discard, who may claim it and how.
function claimsFor(slice, seat, tile, ctx) {
  const hand = slice.hands[seat]
  const k = kindOf(tileOf(ctx, tile))
  const same = hand.filter(id => kindOf(tileOf(ctx, id)) === k)
  const out = []
  if (valueHand(slice, seat, [...hand, tile], { selfDrawn: false, winning: k }, ctx)) out.push({ action: 'win' })
  if (same.length >= 3) out.push({ action: 'kong' })
  if (same.length >= 2) out.push({ action: 'pung' })
  if (seat === nextSeat(slice.lastDiscard.by) && parseKind(k).suited) {
    const { suit, rank } = parseKind(k)
    const holds = (r) => r >= 1 && r <= 9 && hand.some(id => kindOf(tileOf(ctx, id)) === `${suit}_${r}`)
    for (const low of [rank - 2, rank - 1, rank]) {
      const run = [low, low + 1, low + 2]
      if (run.every(r => r === rank || holds(r)) && low >= 1 && low + 2 <= 9) out.push({ action: 'chow', value: run.join('-') })
    }
  }
  return out
}

// Poll the other players: those who can win first, then pung or kong, then chow.
function openClaims(slice, ctx) {
  const by = slice.lastDiscard.by
  const tile = slice.lastDiscard.tile
  const order = [1, 2, 3].map(k => (by + k) % 4)
  const options = order.map(seat => ({ seat, moves: claimsFor(slice, seat, tile, ctx) })).filter(o => o.moves.length)
  const rank = (o) => (o.moves.some(m => m.action === 'win') ? 0 : o.moves.some(m => m.action === 'pung' || m.action === 'kong') ? 1 : 2)
  options.sort((a, b) => rank(a) - rank(b))
  if (!options.length) return startTurn({ ...slice, claim: null }, nextSeat(by), ctx, false)
  return { ...slice, phase: 'claim', claim: { queue: options.map(o => o.seat) }, next: options[0].seat }
}

function take(hand, count, kind, ctx) {
  const taken = []
  const rest = []
  for (const id of hand) {
    if (taken.length < count && kindOf(tileOf(ctx, id)) === kind) taken.push(id)
    else rest.push(id)
  }
  return { taken, rest }
}

export const wall = {
  init(base, ctx) {
    const cut = createRng((ctx.seed || 1) >>> 0).nextInt(0, 3)
    return deal({ seed: ctx.seed || 1, deals: 0, dealer: cut, firstDealer: cut, roundWind: 0, scores: [0, 0, 0, 0], community: [], drawPile: [], finished: null }, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    if (slice.phase === 'claim') return [...claimsFor(slice, seat, slice.lastDiscard.tile, ctx), { action: 'pass' }]
    if (slice.phase === 'rob') return [{ action: 'win' }, { action: 'pass' }]
    if (slice.phase !== 'discard') return []
    const hand = slice.hands[seat]
    const out = hand.map(id => ({ action: 'discard', cards: [id], to: 'discard' }))
    if (slice.flags.selfDrawn && valueHand(slice, seat, hand, { ...slice.flags, winning: slice.drawn ? kindOf(tileOf(ctx, slice.drawn)) : null }, ctx)) out.push({ action: 'win' })
    const counts = new Map()
    for (const id of hand) counts.set(kindOf(tileOf(ctx, id)), (counts.get(kindOf(tileOf(ctx, id))) || 0) + 1)
    for (const [k, n] of counts) if (n === 4) out.push({ action: 'kong', value: k.replace('_', ' ') })
    for (const m of slice.melds[seat]) {
      if (m.type === 'pung' && counts.get(m.kind)) out.push({ action: 'kong', value: m.kind.replace('_', ' ') })
    }
    return out
  },

  apply(move, slice, seat, ctx) {
    if (slice.phase === 'rob') {
      if (move.action === 'win') return win(slice, [{ seat, value: valueHand(slice, seat, [...slice.hands[seat], slice.robbing.tile], { selfDrawn: false, robbing: true, winning: kindOf(tileOf(ctx, slice.robbing.tile)) }, ctx) }], slice.robbing.by, ctx)
      const queue = slice.claim.queue.slice(1)
      if (queue.length) return { ...slice, claim: { queue }, next: queue[0] }
      return startTurn({ ...slice, phase: 'discard', robbing: null, claim: null }, slice.robbing.by, ctx, true)
    }
    if (slice.phase === 'claim') {
      const tile = slice.lastDiscard.tile
      const k = kindOf(tileOf(ctx, tile))
      const s = settings(ctx)
      const winners = slice.claim.winners || []
      const canWin = (o) => claimsFor(slice, o, tile, ctx).some(m => m.action === 'win')
      if (move.action === 'pass' || (move.action === 'win' && s.multipleWinners)) {
        const now = move.action === 'win' ? [...winners, { seat, value: valueHand(slice, seat, [...slice.hands[seat], tile], { selfDrawn: false, winning: k }, ctx) }] : winners
        // Once anyone has won, only other winners are still asked.
        const queue = slice.claim.queue.slice(1).filter(o => !now.length || canWin(o))
        if (queue.length) return { ...slice, claim: { queue, winners: now }, next: queue[0] }
        if (now.length) return win(slice, now, slice.lastDiscard.by, ctx)
        return startTurn({ ...slice, claim: null }, nextSeat(slice.lastDiscard.by), ctx, false)
      }
      if (move.action === 'win') return win(slice, [{ seat, value: valueHand(slice, seat, [...slice.hands[seat], tile], { selfDrawn: false, winning: k }, ctx) }], slice.lastDiscard.by, ctx)
      const discards = slice.discards.map((d, i) => (i === slice.lastDiscard.by ? d.slice(0, -1) : d))
      let used
      let meld
      if (move.action === 'chow') {
        const { suit } = parseKind(k)
        const ranks = move.value.split('-').map(Number)
        let hand = [...slice.hands[seat]]
        used = []
        for (const r of ranks) {
          if (`${suit}_${r}` === k) continue
          const got = take(hand, 1, `${suit}_${r}`, ctx)
          used.push(...got.taken)
          hand = got.rest
        }
        meld = { type: 'chow', kind: `${suit}_${ranks[0]}`, tiles: [...used, tile], open: true }
        return { ...slice, discards, hands: slice.hands.map((h, i) => (i === seat ? hand : h)), melds: slice.melds.map((m, i) => (i === seat ? [...m, meld] : m)), phase: 'discard', claim: null, flags: {}, drawn: null, next: seat }
      }
      const count = move.action === 'kong' ? 3 : 2
      const { taken, rest } = take(slice.hands[seat], count, k, ctx)
      meld = { type: move.action === 'kong' ? 'kong' : 'pung', kind: k, tiles: [...taken, tile], open: true }
      const next = { ...slice, discards, hands: slice.hands.map((h, i) => (i === seat ? rest : h)), melds: slice.melds.map((m, i) => (i === seat ? [...m, meld] : m)), claim: null }
      return move.action === 'kong' ? startTurn(next, seat, ctx, true) : { ...next, phase: 'discard', flags: {}, drawn: null, next: seat }
    }

    // The player to move.
    if (move.action === 'win') return win(slice, [{ seat, value: valueHand(slice, seat, slice.hands[seat], { ...slice.flags, winning: slice.drawn ? kindOf(tileOf(ctx, slice.drawn)) : null }, ctx) }], null, ctx)
    if (move.action === 'kong') {
      const k = move.value.replace(' ', '_')
      const pung = slice.melds[seat].findIndex(m => m.type === 'pung' && m.kind === k)
      if (pung >= 0) {
        // Adding to a pung: another player may rob the kong by winning on the tile.
        const { taken, rest } = take(slice.hands[seat], 1, k, ctx)
        const melds = slice.melds.map((m, i) => (i === seat ? m.map((x, j) => (j === pung ? { ...x, type: 'kong', tiles: [...x.tiles, ...taken] } : x)) : m))
        const next = { ...slice, hands: slice.hands.map((h, i) => (i === seat ? rest : h)), melds }
        const robbers = [1, 2, 3].map(d => (seat + d) % 4).filter(o => valueHand(next, o, [...next.hands[o], taken[0]], { selfDrawn: false, robbing: true, winning: k }, ctx))
        if (robbers.length) return { ...next, phase: 'rob', robbing: { tile: taken[0], by: seat }, claim: { queue: robbers }, next: robbers[0] }
        return startTurn(next, seat, ctx, true)
      }
      const { taken, rest } = take(slice.hands[seat], 4, k, ctx)
      const meld = { type: 'kong', kind: k, tiles: taken, open: false }
      return startTurn({ ...slice, hands: slice.hands.map((h, i) => (i === seat ? rest : h)), melds: slice.melds.map((m, i) => (i === seat ? [...m, meld] : m)) }, seat, ctx, true)
    }
    const id = move.cards[0]
    const next = {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h.filter(t => t !== id) : h)),
      discards: slice.discards.map((d, i) => (i === seat ? [...d, id] : d)),
      lastDiscard: { tile: id, by: seat },
      drawn: null,
      flags: {},
    }
    return openClaims(next, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  // Concealed tiles are private; melds, discards and bonus tiles are open.
  project(slice, seat) {
    return { ...slice, hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))), wall: slice.wall.map(() => null), drawn: slice.next === seat ? slice.drawn : null }
  },

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    if (view.lastDiscard && view.phase === 'claim') groups.push({ label: `${name(view.lastDiscard.by)} discarded · claim it or pass`, cards: [view.lastDiscard.tile], layout: 'pile' })
    groups.push({ label: `Wall ${view.wall.length} · ${WINDS[view.roundWind]} round, ${name(view.dealer)} deals`, cards: [] })
    for (let seat = 0; seat < 4; seat++) {
      const melds = view.melds[seat].flatMap(m => m.tiles)
      const shown = [...view.bonus[seat], ...melds]
      const discards = view.discards[seat].slice(-10)
      if (shown.length) groups.push({ label: `${name(seat)} (${seatWind(view, seat)}) shows`, cards: shown })
      if (discards.length) groups.push({ label: `${name(seat)} discards`, cards: discards })
    }
    if (view.lastHand) {
      const h = view.lastHand
      groups.push({ label: h.drawn ? 'Last hand: drawn, the wall ran out' : `Last hand: ${name(h.winner)} ${h.from === null ? 'self-drawn' : `on ${name(h.from)}'s discard`}, ${h.value} faan (${h.patterns.map(([n, v]) => `${n} ${v}`).join(', ')})`, cards: [] })
    }
    return groups
  },

  describeSeat(view, seat) {
    return `${view.scores[seat]} points · ${seatWind(view, seat)}${seat === view.dealer ? ' · dealer' : ''}`
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return 'A tie on points'
    return `${shown[slice.finished]} wins with ${slice.scores[slice.finished]} points`
  },

  policy(view, seat, moves, ctx) {
    return mahjongPolicy(view, seat, moves, ctx)
  },

  describe(move, ctx) {
    if (move.action === 'discard') return `discards ${tileOf(ctx, move.cards[0])?.display || move.cards[0]}`
    if (move.action === 'chow') return `chows ${move.value}`
    if (move.action === 'kong' && move.value) return `kongs ${move.value}`
    return move.action === 'win' ? 'mahjong!' : move.action
  },
}

// Win whenever allowed; pung dragons and winds that score; keep pairs and
// runs together, and discard the loneliest tile, honours that score nothing first.
function mahjongPolicy(view, seat, moves, ctx) {
  const pick = (action) => moves.find(m => m.action === action)
  if (pick('win')) return pick('win')
  if (view.phase === 'claim') {
    const k = kindOf(tileOf(ctx, view.lastDiscard.tile))
    const p = parseKind(k)
    const scores = p.suit === 'dragon' || (p.suit === 'wind' && (p.rank === seatWind(view, seat) || p.rank === WINDS[view.roundWind]))
    if (scores && (pick('kong') || pick('pung'))) return pick('kong') || pick('pung')
    return pick('pass')
  }
  if (view.phase === 'rob') return pick('pass')
  if (pick('kong')) return pick('kong')
  const hand = view.hands[seat]
  const ks = hand.map(id => kindOf(tileOf(ctx, id)))
  const useful = (i) => {
    const k = ks[i]
    const p = parseKind(k)
    let n = ks.filter((x, j) => j !== i && x === k).length * 3
    if (p.suited) for (const d of [-2, -1, 1, 2]) if (ks.includes(`${p.suit}_${p.rank + d}`)) n += Math.abs(d) === 1 ? 2 : 1
    if (p.suit === 'dragon' || (p.suit === 'wind' && (p.rank === seatWind(view, seat) || p.rank === WINDS[view.roundWind]))) n += 1
    return n
  }
  const discards = moves.filter(m => m.action === 'discard')
  return discards.reduce((a, b) => (useful(hand.indexOf(b.cards[0])) < useful(hand.indexOf(a.cards[0])) ? b : a))
}
