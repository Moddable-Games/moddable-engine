import { createRng } from '../../../../core/index.js'
import { kindOf, parseKind, isBonus, arrangements, isSevenPairs, isThirteenOrphans, waits, placements, doraAfter } from './mahjong-hands.js'
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
//
// A game may declare more of the table's rules, each off unless it says so:
//
//     startingPoints: 30000
//     deadWall: 14             # kept back: four kong replacements, then dora
//                              # indicators with the ura dora beneath them
//     riichi: 1000             # the stake for declaring a waiting hand locked
//     riichiWall: 4            # the fewest tiles left in the wall to declare
//     furiten: true            # no win on a discard while a wait is in your
//                              # own discards, or after passing a winning tile
//     counters: 300            # what each counter on the table adds to a win
//     noten: 3000              # paid by those not waiting to those waiting
//     dealerKeeps: tenpai      # on a drawn hand: always, or only if waiting
//     swapCalling: false       # a claimed tile may not be discarded straight back
//     liability: true          # feeding the last dragon or wind set pays for it
//     lastDiscard: win         # the discard after the last tile: only to win
//     kongAfterClaim: false    # a kong only in a turn that began with a draw
//
// dealerKeeps may also be `never`: the deal passes after every hand.

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
    startingPoints: Number(c.startingPoints ?? 0),
    deadWall: Number(c.deadWall ?? 0),
    riichi: Number(c.riichi ?? 0),
    riichiWall: Number(c.riichiWall ?? 0),
    furiten: !!c.furiten,
    counters: Number(c.counters ?? 0),
    noten: Number(c.noten ?? 0),
    dealerKeeps: c.dealerKeeps || 'always',
    swapCalling: c.swapCalling !== false,
    liability: !!c.liability,
    lastDiscardWinOnly: c.lastDiscard === 'win',
    kongAfterClaim: c.kongAfterClaim !== false,
  }
}

const tileOf = (ctx, id) => ctx.card(id)
const kinds = (ids, ctx) => ids.map(id => kindOf(tileOf(ctx, id)))
const seatWind = (slice, seat) => WINDS[(seat - slice.dealer + 4) % 4]
const isOpen = (slice, seat) => slice.melds[seat].some(m => m.open)

// Every kind of tile in the game, bonus tiles aside.
const universes = new WeakMap()
function universe(ctx) {
  if (!universes.has(ctx.deck)) universes.set(ctx.deck, [...new Set(ctx.deck.filter(c => !isBonus(c)).map(kindOf))])
  return universes.get(ctx.deck)
}

// What a seat's concealed tiles wait on.
function waitsOf(slice, seat, ctx, ids = slice.hands[seat]) {
  const s = settings(ctx)
  const melded = slice.melds[seat].length
  return waits(kinds(ids, ctx), s.sets - melded, s.game.specials && !melded, universe(ctx))
}

// Waiting: a tile would complete the hand, and the player does not already
// hold all four of it.
function tenpai(slice, seat, ctx, ids = slice.hands[seat]) {
  const held = kinds([...ids, ...slice.melds[seat].flatMap(m => m.tiles)], ctx)
  return waitsOf(slice, seat, ctx, ids).some(w => held.filter(k => k === w).length < 4)
}

// Furiten: a wait among the player's own discards, or a winning tile passed.
function furiten(slice, seat, ctx) {
  if (!settings(ctx).furiten) return false
  if (slice.furiten[seat]) return true
  const river = new Set(kinds(slice.discarded[seat], ctx))
  return waitsOf(slice, seat, ctx).some(w => river.has(w))
}

// Every other player waiting on this kind who did not win on it is furiten
// until they next draw or claim; after riichi, until the hand ends.
function markPassed(slice, kind, by, ctx) {
  if (!settings(ctx).furiten) return slice
  return { ...slice, furiten: slice.furiten.map((f, i) => f || (i !== by && waitsOf(slice, i, ctx).includes(kind))) }
}

// Take tiles from the wall, setting bonus tiles aside and drawing again. With
// a dead wall, a kong's replacement comes from it, and the live wall's last
// tile joins it so it stays the same size; the kong turns a new indicator.
function drawFor(slice, seat, ctx, fromBack = false) {
  const wall = [...slice.wall]
  let dead = slice.dead
  const bonus = slice.bonus.map(b => [...b])
  let tile = null
  for (;;) {
    let t
    if (fromBack && dead) {
      if (!dead.replacements.length) break
      t = dead.replacements[0]
      dead = { ...dead, replacements: dead.replacements.slice(1), kongs: dead.kongs + 1 }
      wall.pop()
    } else {
      if (!wall.length) break
      t = fromBack ? wall.pop() : wall.shift()
    }
    if (isBonus(tileOf(ctx, t))) { bonus[seat].push(t); fromBack = true; continue }
    tile = t
    break
  }
  if (tile === null) return null
  return { ...slice, wall, dead, bonus, hands: slice.hands.map((h, i) => (i === seat ? [...h, tile] : h)), drawn: tile }
}

function deal(slice, ctx) {
  const s = settings(ctx)
  const wall = createRng((slice.seed ^ Math.imul(slice.deals + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  let dead = null
  if (s.deadWall) {
    const tiles = wall.splice(wall.length - s.deadWall)
    const pairs = Array.from({ length: (s.deadWall - 4) / 2 }, (_, i) => 4 + 2 * i)
    dead = { replacements: tiles.slice(0, 4), indicators: pairs.map(i => tiles[i]), under: pairs.map(i => tiles[i + 1]), kongs: 0 }
  }
  const four = (v) => [0, 1, 2, 3].map(() => (typeof v === 'function' ? v() : v))
  let next = {
    ...slice, deals: slice.deals + 1, wall, dead,
    hands: four(() => []), melds: four(() => []), discards: four(() => []), discarded: four(() => []), bonus: four(() => []),
    riichi: four(null), furiten: four(false), liable: four(null), uninterrupted: true, log: [],
    lastDiscard: null, claim: null, drawn: null, flags: {},
  }
  for (let k = 0; k < s.handSize; k++) for (let p = 0; p < 4; p++) next = drawFor(next, (next.dealer + p) % 4, ctx)
  return startTurn({ ...next, phase: 'discard' }, next.dealer, ctx, false)
}

// A turn begins with a draw from the wall; an empty wall is a drawn hand.
function startTurn(slice, seat, ctx, afterKong) {
  const drew = drawFor(slice, seat, ctx, afterKong)
  if (!drew) return exhausted(slice, ctx)
  const cleared = drew.furiten.map((f, i) => (i === seat && !drew.riichi[i] ? false : f))
  return { ...drew, furiten: cleared, phase: 'discard', next: seat, flags: { selfDrawn: true, afterKong, lastTile: !drew.wall.length } }
}

// Dora: each indicator turned points to the next tile, and each tile of that
// kind in the hand is a han; after riichi the tiles beneath count as well.
function doraIn(slice, allKinds, riichi, ctx) {
  if (!slice.dead || !settings(ctx).game.dora) return {}
  const turned = 1 + slice.dead.kongs
  const count = (ids) => ids.slice(0, turned).reduce((n, id) => n + allKinds.filter(k => k === doraAfter(kindOf(tileOf(ctx, id)))).length, 0)
  return { dora: count(slice.dead.indicators), uraDora: riichi ? count(slice.dead.under) : 0 }
}

// What the table knows about how a hand was won, for the scorers that ask:
// riichi, and a win in the first uninterrupted go-around.
function circumstances(slice, seat, how, allKinds, ctx) {
  const declared = slice.riichi[seat]
  const first = slice.uninterrupted && !slice.discarded[seat].length
  let blessing = null
  if (first && how.selfDrawn) blessing = seat === slice.dealer ? 'heaven' : 'earth'
  if (first && !how.selfDrawn && seat !== slice.dealer) blessing = 'man'
  const opening = slice.lastDiscard
  return {
    riichi: !!declared,
    doubleRiichi: !!declared?.double,
    ippatsu: !!declared?.ippatsu,
    blessing,
    dealersFirstDiscard: !how.selfDrawn && !!opening && opening.by === slice.dealer && slice.discarded[slice.dealer].length === 1,
    ...doraIn(slice, allKinds, !!declared, ctx),
  }
}

// The best value of this seat's hand with these concealed tiles, or null.
// Every reading is tried, and every place the winning tile could sit in it:
// won on a discard, a pung that took the winning tile counts as open.
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
    ...circumstances(slice, seat, how, allKinds, ctx),
    ...how,
  }
  const readings = []
  if (s.game.specials && !exposed.length && isThirteenOrphans(concealedKinds)) readings.push({ ...base, sets: [], pair: null, special: 'thirteen-orphans', wait: null })
  if (s.game.specials && !exposed.length && isSevenPairs(concealedKinds, s.game.pairsMayRepeat)) readings.push({ ...base, sets: [], pair: null, special: 'seven-pairs', wait: 'pair' })
  const openSets = exposed.map(m => ({ type: m.type, kind: m.kind, open: m.open }))
  for (const a of arrangements(concealedKinds, s.sets - exposed.length)) {
    const where = placements(a, how.winning)
    for (const at of where.length ? where : [{ wait: null, index: -1 }]) {
      const sets = a.sets.map((x, i) => ({ ...x, open: !how.selfDrawn && at.wait === 'pung' && at.index === i }))
      readings.push({ ...base, sets: [...openSets, ...sets], pair: a.pair, special: null, wait: at.wait })
    }
  }
  let best = null
  for (const r of readings) {
    const v = s.scorer(r)
    if (v && (!best || (v.rank ?? v.value) > (best.rank ?? best.value))) best = v
  }
  return best && best.value >= s.minimum ? best : null
}

function nextSeat(seat) {
  return (seat + 1) % 4
}

// The hand is over. The dealer keeps the deal or it passes on, and the wind
// round moves on once every seat has dealt. At the end, the most points
// wins, and any riichi sticks still on the table go to the winner, split on a tie.
function endHand(slice, dealerKeeps, ctx, payment = null, counters = slice.counters) {
  const s = settings(ctx)
  const scores = [...slice.scores]
  if (payment) payment.forEach((v, i) => { scores[i] += v })
  let dealer = slice.dealer
  let roundWind = slice.roundWind
  if (!dealerKeeps) {
    dealer = nextSeat(slice.dealer)
    if (dealer === slice.firstDealer) roundWind++
  }
  const next = { ...slice, scores, dealer, roundWind, counters, lastHand: slice.lastHand }
  if (roundWind >= s.rounds) {
    const top = Math.max(...scores)
    const leaders = scores.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0)
    for (const i of leaders) scores[i] += slice.pot / leaders.length
    return { ...next, scores, pot: 0, phase: 'over', finished: leaders.length === 1 ? leaders[0] : 'draw', next: null }
  }
  return deal(next, ctx)
}

// The wall has run out. Where the game says so, those not waiting pay those
// who are, and the dealer keeps the deal only while waiting. A counter goes on
// the table.
function exhausted(slice, ctx) {
  const s = settings(ctx)
  const waiting = [0, 1, 2, 3].filter(i => (s.noten || s.dealerKeeps === 'tenpai') && tenpai(slice, i, ctx))
  const payment = [0, 0, 0, 0]
  if (s.noten && waiting.length > 0 && waiting.length < 4) {
    for (let i = 0; i < 4; i++) payment[i] = waiting.includes(i) ? s.noten / waiting.length : -s.noten / (4 - waiting.length)
  }
  const keeps = s.dealerKeeps === 'tenpai' ? waiting.includes(slice.dealer) : s.dealerKeeps !== 'never'
  return endHand({ ...slice, lastHand: { drawn: true, waiting } }, keeps, ctx, payment, slice.counters + 1)
}

// Same-round immunity: of the discards since the winner's own last one
// (that one included), the first of the winning kind makes its discarder
// responsible; if that was the winner's own, no one is.
function sameRound(slice, winner, ctx) {
  const log = slice.log
  const kind = kindOf(tileOf(ctx, log[log.length - 1].tile))
  let start = 0
  for (let i = log.length - 2; i >= 0; i--) if (log[i].by === winner) { start = i; break }
  const first = log.slice(start).find(e => kindOf(tileOf(ctx, e.tile)) === kind)
  return first.by === winner ? null : first.by
}

// Pay one or more winners: on a self-drawn win every other player pays, on a
// discard the discarder pays each winner. Where the game says so, a payment
// the dealer makes or receives is doubled; each counter on the table adds to
// the win; and a player who fed the last dragon or wind set to an opponent
// already showing the rest pays for Big Three Dragons or Big Four Winds, all
// of a self-drawn win and half of one won on another player's discard.
function win(slice, winners, from, ctx) {
  const s = settings(ctx)
  const { game } = s
  const payment = [0, 0, 0, 0]
  const hands = []
  for (const { seat, value } of winners) {
    const selfDrawn = from === null
    const points = game.pays ? (value.basic ?? value.value) : game.points(value.value)
    const responsible = selfDrawn ? null : game.immunity && !slice.robbing ? sameRound(slice, seat, ctx) : from
    const owed = (payer) => (game.pays
      ? game.pays(value, { selfDrawn, winnerIsDealer: seat === slice.dealer, payerIsDealer: payer === slice.dealer, responsible: responsible === null ? null : payer === responsible })
      : points * (selfDrawn ? game.selfDraw : 1) * (game.dealerDouble && (payer === slice.dealer || seat === slice.dealer) ? 2 : 1))
    const pay = (payer, amount) => { payment[payer] -= amount; payment[seat] += amount }
    const bonus = s.counters * slice.counters
    const fed = s.liability ? slice.liable[seat] : null
    const liable = fed && value.patterns.some(([name]) => name === fed.yakuman) ? fed.by : null
    const others = [0, 1, 2, 3].filter(i => i !== seat)
    if (selfDrawn && liable !== null) pay(liable, others.reduce((n, i) => n + owed(i), 0) + bonus)
    else if (selfDrawn) for (const i of others) pay(i, owed(i) + bonus / 3)
    else if (liable !== null && liable !== from) { pay(from, owed(from) / 2 + bonus); pay(liable, owed(from) / 2) }
    else if (game.allPay) for (const i of others) pay(i, owed(i))
    else pay(from, owed(from) + bonus)
    hands.push({ winner: seat, value: value.value, fu: value.fu, limit: value.limit, patterns: value.patterns, points })
  }
  // Riichi sticks: a winner who declared takes their own back, and the first
  // winner after the discarder takes the rest.
  let pot = slice.pot
  for (const { seat } of winners) if (slice.riichi[seat]) { payment[seat] += s.riichi; pot -= s.riichi }
  payment[winners[0].seat] += pot
  const dealerWon = winners.some(w => w.seat === slice.dealer)
  return endHand({ ...slice, pot: 0, lastHand: { ...hands[0], from, winners: hands } }, dealerWon && s.dealerKeeps !== 'never', ctx, payment, dealerWon ? slice.counters + 1 : 0)
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

// A kong needs a replacement tile to draw, and a live wall to give one up.
function canKong(slice, ctx) {
  if (!slice.dead) return true
  return slice.dead.replacements.length > 0 && slice.wall.length > 0
}

// Swap-calling: after a claim, the claimed kind may not be discarded, nor,
// for a chow claimed at one end, the kind beyond the other end.
function forbiddenAfter(kind, run) {
  const out = [kind]
  if (!run) return out
  const { suit, rank } = parseKind(kind)
  if (rank === run[0] && run[2] + 1 <= 9) out.push(`${suit}_${run[2] + 1}`)
  if (rank === run[2] && run[0] - 1 >= 1) out.push(`${suit}_${run[0] - 1}`)
  return out
}

// After a discard, who may claim it and how.
function claimsFor(slice, seat, tile, ctx) {
  const s = settings(ctx)
  const hand = slice.hands[seat]
  const k = kindOf(tileOf(ctx, tile))
  const same = hand.filter(id => kindOf(tileOf(ctx, id)) === k)
  const out = []
  if (!furiten(slice, seat, ctx) && valueHand(slice, seat, [...hand, tile], { selfDrawn: false, winning: k, lastTile: !slice.wall.length }, ctx)) out.push({ action: 'win' })
  // A riichi hand is locked; the last discard may only be won on.
  if (slice.riichi[seat] || (s.lastDiscardWinOnly && !slice.wall.length)) return out
  // Without swap-calling, a claim must leave something else to discard.
  const leaves = (used, run) => {
    if (s.swapCalling) return true
    const barred = forbiddenAfter(k, run)
    const rest = [...hand]
    for (const id of used) rest.splice(rest.indexOf(id), 1)
    return rest.some(id => !barred.includes(kindOf(tileOf(ctx, id))))
  }
  if (same.length >= 3 && canKong(slice, ctx)) out.push({ action: 'kong' })
  if (same.length >= 2 && leaves(same.slice(0, 2))) out.push({ action: 'pung' })
  if (seat === nextSeat(slice.lastDiscard.by) && parseKind(k).suited) {
    const { suit, rank } = parseKind(k)
    const holding = (r) => hand.find(id => kindOf(tileOf(ctx, id)) === `${suit}_${r}`)
    for (const low of [rank - 2, rank - 1, rank]) {
      const run = [low, low + 1, low + 2]
      if (low < 1 || low + 2 > 9 || !run.every(r => r === rank || holding(r))) continue
      if (leaves(run.filter(r => r !== rank).map(holding), run)) out.push({ action: 'chow', value: run.join('-') })
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
  if (!options.length) return startTurn(passed({ ...slice, claim: null }, ctx), nextSeat(by), ctx, false)
  return { ...slice, phase: 'claim', claim: { queue: options.map(o => o.seat) }, next: options[0].seat }
}

// A discard nobody won on: a riichi declared with it stands, its stake goes
// on the table, and anyone waiting on it becomes furiten.
function passed(slice, ctx) {
  const s = settings(ctx)
  const d = slice.lastDiscard
  let next = markPassed(slice, kindOf(tileOf(ctx, d.tile)), d.by, ctx)
  if (d.riichi) {
    next = {
      ...next,
      scores: next.scores.map((v, i) => (i === d.by ? v - s.riichi : v)),
      pot: next.pot + s.riichi,
      riichi: next.riichi.map((r, i) => (i === d.by ? { ippatsu: true, double: d.double } : r)),
      lastDiscard: { ...d, riichi: false },
    }
  }
  return next
}

// Any call breaks the first go-around and every riichi's one-shot chance.
const interrupted = (slice) => ({ ...slice, uninterrupted: false, riichi: slice.riichi.map(r => (r ? { ...r, ippatsu: false } : r)) })

// A riichi hand may add a concealed kong only with the tile just drawn, only
// if the three it holds are a pung in every reading of the waiting hand, and
// only if the wait stays the same.
function riichiKong(slice, seat, kind, ctx) {
  if (!slice.drawn || kindOf(tileOf(ctx, slice.drawn)) !== kind) return false
  const s = settings(ctx)
  const before = slice.hands[seat].filter(id => id !== slice.drawn)
  const beforeKinds = kinds(before, ctx)
  const was = waitsOf(slice, seat, ctx, before)
  const sets = s.sets - slice.melds[seat].length
  if (!was.every(w => arrangements([...beforeKinds, w], sets).every(a => a.sets.some(x => x.type === 'pung' && x.kind === kind)))) return false
  const after = beforeKinds.filter(k => k !== kind)
  const now = waits(after, sets - 1, false, universe(ctx))
  return now.length === was.length && now.every(w => was.includes(w))
}

// A player showing two dragon sets, or three wind sets, who claims the last
// one from a discard: the discarder is liable for the limit hand it makes.
function liabilityFor(slice, seat, kind, by) {
  const suit = parseKind(kind).suit
  const shown = slice.melds[seat].filter(m => m.open && m.type !== 'chow' && parseKind(m.kind).suit === suit).length
  if (suit === 'dragon' && shown === 2) return { by, yakuman: 'Big Three Dragons' }
  if (suit === 'wind' && shown === 3) return { by, yakuman: 'Big Four Winds' }
  return slice.liable[seat]
}

export const wall = {
  init(base, ctx) {
    const cut = createRng((ctx.seed || 1) >>> 0).nextInt(0, 3)
    const start = settings(ctx).startingPoints
    return deal({ seed: ctx.seed || 1, deals: 0, dealer: cut, firstDealer: cut, roundWind: 0, scores: [start, start, start, start], pot: 0, counters: 0, community: [], drawPile: [], finished: null }, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    if (slice.phase === 'claim') return [...claimsFor(slice, seat, slice.lastDiscard.tile, ctx), { action: 'pass' }]
    if (slice.phase === 'rob') return [{ action: 'win' }, { action: 'pass' }]
    if (slice.phase !== 'discard') return []
    const s = settings(ctx)
    const hand = slice.hands[seat]
    const locked = !!slice.riichi[seat]
    const barred = new Set(slice.flags.forbidden || [])
    const out = (locked ? [slice.drawn] : hand.filter(id => !barred.has(kindOf(tileOf(ctx, id)))))
      .map(id => ({ action: 'discard', cards: [id], to: 'discard' }))
    if (slice.flags.selfDrawn && valueHand(slice, seat, hand, { ...slice.flags, winning: slice.drawn ? kindOf(tileOf(ctx, slice.drawn)) : null }, ctx)) out.push({ action: 'win' })
    // Riichi: a concealed hand that one discard leaves waiting.
    if (s.riichi && !locked && slice.flags.selfDrawn && !isOpen(slice, seat) && slice.wall.length >= s.riichiWall) {
      for (const id of hand) {
        if (tenpai(slice, seat, ctx, hand.filter(t => t !== id))) out.push({ action: 'riichi', cards: [id], to: 'discard', label: 'Riichi' })
      }
    }
    if (!canKong(slice, ctx) || (!s.kongAfterClaim && !slice.flags.selfDrawn)) return out
    const counts = new Map()
    for (const id of hand) counts.set(kindOf(tileOf(ctx, id)), (counts.get(kindOf(tileOf(ctx, id))) || 0) + 1)
    for (const [k, n] of counts) if (n === 4 && (!locked || riichiKong(slice, seat, k, ctx))) out.push({ action: 'kong', value: k.replace('_', ' ') })
    for (const m of slice.melds[seat]) {
      if (m.type === 'pung' && counts.get(m.kind)) out.push({ action: 'kong', value: m.kind.replace('_', ' ') })
    }
    return out
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    if (slice.phase === 'rob') {
      const tile = slice.robbing.tile
      const k = kindOf(tileOf(ctx, tile))
      if (move.action === 'win') return win(slice, [{ seat, value: valueHand(slice, seat, [...slice.hands[seat], tile], { selfDrawn: false, robbing: true, winning: k }, ctx) }], slice.robbing.by, ctx)
      const queue = slice.claim.queue.slice(1)
      if (queue.length) return { ...slice, claim: { queue }, next: queue[0] }
      return startTurn(markPassed({ ...slice, phase: 'discard', robbing: null, claim: null }, k, slice.robbing.by, ctx), slice.robbing.by, ctx, true)
    }
    if (slice.phase === 'claim') {
      const tile = slice.lastDiscard.tile
      const k = kindOf(tileOf(ctx, tile))
      const winners = slice.claim.winners || []
      const valued = (o) => valueHand(slice, o, [...slice.hands[o], tile], { selfDrawn: false, winning: k, lastTile: !slice.wall.length }, ctx)
      const canWin = (o) => claimsFor(slice, o, tile, ctx).some(m => m.action === 'win')
      if (move.action === 'pass' || (move.action === 'win' && s.multipleWinners)) {
        const now = move.action === 'win' ? [...winners, { seat, value: valued(seat) }] : winners
        // Once anyone has won, only other winners are still asked.
        const queue = slice.claim.queue.slice(1).filter(o => !now.length || canWin(o))
        if (queue.length) return { ...slice, claim: { queue, winners: now }, next: queue[0] }
        if (now.length) return win(slice, now, slice.lastDiscard.by, ctx)
        return startTurn(passed({ ...slice, claim: null }, ctx), nextSeat(slice.lastDiscard.by), ctx, false)
      }
      if (move.action === 'win') return win(slice, [{ seat, value: valued(seat) }], slice.lastDiscard.by, ctx)
      // A meld: the discard stands, and the claim breaks the go-around.
      const by = slice.lastDiscard.by
      const claimed = interrupted(passed(slice, ctx))
      const discards = claimed.discards.map((d, i) => (i === by ? d.slice(0, -1) : d))
      const furitenNow = claimed.furiten.map((f, i) => (i === seat ? false : f))
      if (move.action === 'chow') {
        const { suit } = parseKind(k)
        const ranks = move.value.split('-').map(Number)
        let hand = [...claimed.hands[seat]]
        const used = []
        for (const r of ranks) {
          if (`${suit}_${r}` === k) continue
          const got = take(hand, 1, `${suit}_${r}`, ctx)
          used.push(...got.taken)
          hand = got.rest
        }
        const meld = { type: 'chow', kind: `${suit}_${ranks[0]}`, tiles: [...used, tile], open: true }
        const forbidden = s.swapCalling ? [] : forbiddenAfter(k, ranks)
        return { ...claimed, discards, furiten: furitenNow, hands: claimed.hands.map((h, i) => (i === seat ? hand : h)), melds: claimed.melds.map((m, i) => (i === seat ? [...m, meld] : m)), phase: 'discard', claim: null, flags: { forbidden }, drawn: null, next: seat }
      }
      const count = move.action === 'kong' ? 3 : 2
      const { taken, rest } = take(claimed.hands[seat], count, k, ctx)
      const meld = { type: move.action === 'kong' ? 'kong' : 'pung', kind: k, tiles: [...taken, tile], open: true }
      const liable = s.liability ? claimed.liable.map((l, i) => (i === seat ? liabilityFor(claimed, seat, k, by) : l)) : claimed.liable
      const next = { ...claimed, discards, furiten: furitenNow, liable, hands: claimed.hands.map((h, i) => (i === seat ? rest : h)), melds: claimed.melds.map((m, i) => (i === seat ? [...m, meld] : m)), claim: null }
      if (move.action === 'kong') return startTurn(next, seat, ctx, true)
      return { ...next, phase: 'discard', flags: { forbidden: s.swapCalling ? [] : forbiddenAfter(k, null) }, drawn: null, next: seat }
    }

    // The player to move.
    if (move.action === 'win') return win(slice, [{ seat, value: valueHand(slice, seat, slice.hands[seat], { ...slice.flags, winning: slice.drawn ? kindOf(tileOf(ctx, slice.drawn)) : null }, ctx) }], null, ctx)
    if (move.action === 'kong') {
      const k = move.value.replace(' ', '_')
      const called = interrupted(slice)
      const pung = called.melds[seat].findIndex(m => m.type === 'pung' && m.kind === k)
      if (pung >= 0) {
        // Adding to a pung: another player may rob the kong by winning on the tile.
        const { taken, rest } = take(called.hands[seat], 1, k, ctx)
        const melds = called.melds.map((m, i) => (i === seat ? m.map((x, j) => (j === pung ? { ...x, type: 'kong', tiles: [...x.tiles, ...taken] } : x)) : m))
        const next = { ...called, hands: called.hands.map((h, i) => (i === seat ? rest : h)), melds }
        const robbers = [1, 2, 3].map(d => (seat + d) % 4).filter(o => !furiten(next, o, ctx) && valueHand(next, o, [...next.hands[o], taken[0]], { selfDrawn: false, robbing: true, winning: k }, ctx))
        if (robbers.length) return { ...next, phase: 'rob', robbing: { tile: taken[0], by: seat }, claim: { queue: robbers }, next: robbers[0] }
        return startTurn(markPassed(next, k, seat, ctx), seat, ctx, true)
      }
      const { taken, rest } = take(called.hands[seat], 4, k, ctx)
      const meld = { type: 'kong', kind: k, tiles: taken, open: false }
      return startTurn({ ...called, hands: called.hands.map((h, i) => (i === seat ? rest : h)), melds: called.melds.map((m, i) => (i === seat ? [...m, meld] : m)) }, seat, ctx, true)
    }
    // A discard, or a riichi declared with one. A player already in riichi
    // has had their one-shot go-around once they discard again.
    const id = move.cards[0]
    const declaring = move.action === 'riichi'
    const next = {
      ...slice,
      hands: slice.hands.map((h, i) => (i === seat ? h.filter(t => t !== id) : h)),
      discards: slice.discards.map((d, i) => (i === seat ? [...d, id] : d)),
      discarded: slice.discarded.map((d, i) => (i === seat ? [...d, id] : d)),
      log: [...slice.log, { by: seat, tile: id }],
      riichi: slice.riichi.map((r, i) => (i === seat && r ? { ...r, ippatsu: false } : r)),
      lastDiscard: { tile: id, by: seat, riichi: declaring, double: declaring && slice.uninterrupted && !slice.discarded[seat].length },
      drawn: null,
      flags: {},
    }
    return openClaims(next, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  // Concealed tiles are private, and so is the dead wall but for the
  // indicators turned; melds, discards and bonus tiles are open.
  project(slice, seat) {
    const dead = slice.dead && {
      ...slice.dead,
      replacements: slice.dead.replacements.map(() => null),
      indicators: slice.dead.indicators.map((id, i) => (i <= slice.dead.kongs ? id : null)),
      under: slice.dead.under.map(() => null),
    }
    return { ...slice, dead, hands: slice.hands.map((h, i) => (i === seat ? h : h.map(() => null))), wall: slice.wall.map(() => null), drawn: slice.next === seat ? slice.drawn : null }
  },

  table(view, ctx) {
    const s = settings(ctx)
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = []
    if (view.lastDiscard && view.phase === 'claim') groups.push({ label: `${name(view.lastDiscard.by)} discarded · claim it or pass`, cards: [view.lastDiscard.tile], layout: 'pile' })
    const extras = []
    if (s.counters && view.counters) extras.push(`${view.counters} counter${view.counters === 1 ? '' : 's'}`)
    if (view.pot) extras.push(`${view.pot} in riichi sticks`)
    groups.push({ label: [`Wall ${view.wall.length} · ${WINDS[view.roundWind]} round, ${name(view.dealer)} deals`, ...extras].join(' · '), cards: [] })
    if (view.dead && s.game.dora) groups.push({ label: 'Dora indicators', cards: view.dead.indicators.filter(Boolean) })
    for (let seat = 0; seat < 4; seat++) {
      const melds = view.melds[seat].flatMap(m => m.tiles)
      const shown = [...view.bonus[seat], ...melds]
      const discards = view.discards[seat].slice(-10)
      const riichi = view.riichi[seat] ? ' · riichi' : ''
      if (shown.length) groups.push({ label: `${name(seat)} (${seatWind(view, seat)}) shows`, cards: shown })
      if (discards.length) groups.push({ label: `${name(seat)} discards${riichi}`, cards: discards })
    }
    if (view.lastHand) groups.push({ label: lastHandLabel(view.lastHand, s.game.unit, name), cards: [] })
    return groups
  },

  describeSeat(view, seat) {
    return `${view.scores[seat]} points · ${seatWind(view, seat)}${seat === view.dealer ? ' · dealer' : ''}${view.riichi[seat] ? ' · riichi' : ''}`
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
    if (move.action === 'riichi') return `riichi, discarding ${tileOf(ctx, move.cards[0])?.display || move.cards[0]}`
    if (move.action === 'chow') return `chows ${move.value}`
    if (move.action === 'kong' && move.value) return `kongs ${move.value}`
    return move.action === 'win' ? 'mahjong!' : move.action
  },
}

function lastHandLabel(h, unit, name) {
  if (h.drawn) {
    const waiting = h.waiting?.length ? `; waiting: ${h.waiting.map(name).join(', ')}` : ''
    return `Last hand: drawn, the wall ran out${waiting}`
  }
  const how = h.from === null ? 'self-drawn' : `on ${name(h.from)}'s discard`
  const worth = h.limit === 'Yakuman' ? 'yakuman' : `${h.value} ${unit}${h.fu ? ` ${h.fu} fu` : ''}${h.limit ? `, ${h.limit.toLowerCase()}` : ''}`
  return `Last hand: ${name(h.winner)} ${how}, ${worth} (${h.patterns.map(([n, v]) => `${n} ${v}`).join(', ')})`
}

// Win whenever allowed; pung dragons and winds that score; declare riichi
// when a discard leaves the hand waiting; keep pairs and runs together, and
// discard the loneliest tile, honours that score nothing first.
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
  const riichi = moves.filter(m => m.action === 'riichi')
  const discards = riichi.length ? riichi : moves.filter(m => m.action === 'discard')
  return discards.reduce((a, b) => (useful(hand.indexOf(b.cards[0])) < useful(hand.indexOf(a.cards[0])) ? b : a))
}
