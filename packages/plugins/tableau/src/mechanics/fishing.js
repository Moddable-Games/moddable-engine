import { createRng } from '../../../../core/index.js'

// Fishing: the hanafuda matching games - Koi-Koi, Hana-Awase, Go-Stop
// (engine#184). A turn is two captures: a card played from hand takes a card
// of the same month from the table, and then the top of the draw pile does the
// same; where two cards on the table match, the player chooses which; where
// three do, "they collect all cards of that suit". An unmatched card stays on
// the table. What the captures are worth is the game's:
//
//   scoring: yaku       Koi-Koi: combinations (yaku) with values; a player who
//                       makes one stops or calls koi-koi and plays on.
//   scoring: points     Hana-Awase: each captured card is worth its type's value.
//   scoring: go-stop    Go-Stop: combinations to a threshold, then Go or Stop,
//                       for chips, with the special captures that take junk.
//
//     game: fishing
//     cardsEach: { 2: 8, 3: 7, 4: 5 }
//     field: { 2: 8, 3: 6, 4: 8 }
//     rounds: 12

const BRIGHT = 'hikari', ANIMAL = 'tane', RIBBON = 'tanzaku', PLAIN = 'kasu'

function settings(ctx) {
  const c = ctx.config
  const byCount = (table, fallback) => {
    for (let n = ctx.seats; n >= 1; n--) if (table && table[n] !== undefined) return Number(table[n])
    return fallback
  }
  const names = ctx.names
  const seatOf = (n) => (typeof n === 'number' ? n : names.indexOf(n))
  // Partnerships apply only when every seat they name is at the table.
  const named = (c.partnerships || []).map(t => t.map(seatOf))
  const teams = named.every(t => t.every(i => i >= 0 && i < ctx.seats)) ? named : []
  return {
    scoring: c.scoring || 'yaku',
    each: byCount(c.cardsEach, 8),
    field: byCount(c.field, 8),
    rounds: Number(c.rounds ?? 1) || 1,
    teams,
    sideOf: (seat) => { const i = teams.findIndex(t => t.includes(seat)); return i >= 0 ? i : seat },
    sides: teams.length || ctx.seats,
    values: c.cardValues || { hikari: 20, tane: 10, tanzaku: 5, kasu: 1 },
    threshold: byCount(c.goThreshold, 3),
  }
}

const monthOf = (ctx, id) => ctx.card(id).month
const typeOf = (ctx, id) => ctx.card(id).type
const nameOf = (ctx, id) => ctx.card(id).name

// --- Koi-Koi yaku, from Wikipedia ------------------------------------------

function kinds(pile, ctx) {
  const brights = pile.filter(id => typeOf(ctx, id) === BRIGHT)
  const has = (month, name) => pile.some(id => monthOf(ctx, id) === month && nameOf(ctx, id) === name)
  const sake = has('chrysanthemum', 'Sake Cup')
  return {
    brights,
    rain: brights.some(id => nameOf(ctx, id) === 'Rain Man'),
    animals: pile.filter(id => typeOf(ctx, id) === ANIMAL).length,
    ribbons: pile.filter(id => typeOf(ctx, id) === RIBBON).length,
    // The sake cup "counts as both a 10-point card and a 1-point card".
    plains: pile.filter(id => typeOf(ctx, id) === PLAIN).length + (sake ? 1 : 0),
    has,
    sake,
  }
}

export function koiKoiYaku(pile, ctx) {
  const k = kinds(pile, ctx)
  const out = []
  const b = k.brights.length
  if (b === 5) out.push(['Goko', 10])
  else if (b === 4) out.push(k.rain ? ['Ame-Shiko', 7] : ['Shiko', 8])
  else if (b === 3 && !k.rain) out.push(['Sanko', 5])
  if (k.has('pampas', 'Moon') && k.sake) out.push(['Tsukimi-zake', 5])
  if (k.has('cherry', 'Curtain') && k.sake) out.push(['Hanami-zake', 5])
  if (k.has('clover', 'Boar') && k.has('maple', 'Deer') && k.has('peony', 'Butterflies')) out.push(['Inoshikacho', 5])
  if (k.animals >= 5) out.push(['Tane', k.animals - 4])
  const red = ['pine', 'plum', 'cherry'].every(m => k.has(m, 'Poetry Ribbon'))
  const blue = ['peony', 'chrysanthemum', 'maple'].every(m => k.has(m, 'Blue Ribbon'))
  if (red && blue) out.push(['Akatan-Aotan', 10])
  else { if (red) out.push(['Akatan', 5]); if (blue) out.push(['Aotan', 5]) }
  if (k.ribbons >= 5) out.push(['Tanzaku', k.ribbons - 4])
  if (k.plains >= 10) out.push(['Kasu', k.plains - 9])
  return out
}

// --- Go-Stop combinations, from the page and Wikipedia ---------------------

// Two junk cards count double: the willow's lightning and a paulownia plain.
const DOUBLE_JUNK = new Set(['willow_lightning', 'paulownia_plain-3'])
function junkCount(pile, ctx) {
  return pile.filter(id => typeOf(ctx, id) === PLAIN).reduce((n, id) => n + (DOUBLE_JUNK.has(id) ? 2 : 1), 0)
}

export function goStopScore(pile, ctx) {
  const k = kinds(pile, ctx)
  let score = 0
  const b = k.brights.length
  if (b === 5) score += 15
  else if (b === 4) score += 4
  else if (b === 3) score += k.rain ? 2 : 3
  // Godori: the three birds, February, April and August.
  if (k.has('plum', 'Bush Warbler') && k.has('wisteria', 'Cuckoo') && k.has('pampas', 'Geese')) score += 5
  if (k.animals >= 5) score += k.animals - 4
  if (['pine', 'plum', 'cherry'].every(m => k.has(m, 'Poetry Ribbon'))) score += 3
  if (['peony', 'chrysanthemum', 'maple'].every(m => k.has(m, 'Blue Ribbon'))) score += 3
  if (['wisteria', 'iris', 'clover'].every(m => k.has(m, 'Red Ribbon'))) score += 3
  if (k.ribbons >= 5) score += k.ribbons - 4
  const junk = junkCount(pile, ctx)
  if (junk >= 10) score += junk - 9
  return score
}

// --- the deal ---------------------------------------------------------------

function voidField(field, ctx) {
  const counts = new Map()
  for (const id of field) counts.set(monthOf(ctx, id), (counts.get(monthOf(ctx, id)) || 0) + 1)
  return [...counts.values()].some(n => n === 4)
}

function dealt(hand, ctx) {
  const counts = new Map()
  for (const id of hand) counts.set(monthOf(ctx, id), (counts.get(monthOf(ctx, id)) || 0) + 1)
  const values = [...counts.values()]
  if (values.some(n => n === 4)) return 'Teshi'
  if (hand.length === 8 && values.length === 4 && values.every(n => n === 2)) return 'Kuttsuki'
  return null
}

function deal(slice, ctx, attempt = 0) {
  const s = settings(ctx)
  const seats = ctx.seats
  // Every deal is shuffled afresh, a void one or a replayed nagari included.
  const deals = (slice.deals || 0) + 1
  const pool = createRng((slice.seed ^ Math.imul(deals * 31 + attempt + 1, 0x9E3779B1)) >>> 0).shuffle(ctx.deck.map(c => c.id))
  const hands = Array.from({ length: seats }, () => [])
  for (let k = 0; k < s.each; k++) for (let p = 1; p <= seats; p++) hands[(slice.dealer + p) % seats].push(pool.shift())
  const field = pool.splice(0, s.field)
  // A table dealt four of one month is void, and dealt again.
  if (voidField(field, ctx) && attempt < 20) return deal(slice, ctx, attempt + 1)
  let next = {
    ...slice,
    deals,
    hands,
    field,
    drawPile: pool,
    community: [],
    piles: Array.from({ length: seats }, () => []),
    phase: 'play',
    pending: null,
    called: Array(seats).fill(0),
    lastScore: Array(seats).fill(0),
    turn: null,
    next: slice.dealer,
  }
  if (s.scoring === 'yaku') {
    // A dealt Teshi or Kuttsuki wins the hand at once.
    const lucky = hands.findIndex(h => dealt(h, ctx))
    if (lucky >= 0) return endRound(next, lucky, 6, `${dealt(hands[lucky], ctx)} dealt`, ctx)
  }
  return next
}

// --- ending a hand ------------------------------------------------------------

function nextRoundOrOver(slice, dealer, ctx) {
  const s = settings(ctx)
  const round = slice.round + 1
  if (round >= s.rounds) {
    // Go-Stop is won on chips, the others on points.
    const scores = slice.chips || slice.scores
    const top = Math.max(...scores)
    const leaders = scores.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0)
    const winner = leaders.length === 1 ? (s.teams.length ? s.teams[leaders[0]][0] : leaders[0]) : 'draw'
    return { ...slice, round, phase: 'over', finished: winner, next: null }
  }
  return deal({ ...slice, round, dealer }, ctx)
}

function endRound(slice, winner, points, why, ctx) {
  const s = settings(ctx)
  const scores = slice.scores.map((v, i) => (i === s.sideOf(winner) ? v + points : v))
  return nextRoundOrOver({ ...slice, scores, lastRound: { winner, points, why } }, winner, ctx)
}

// Koi-Koi: the value of a hand stopped by `seat`.
function stopKoiKoi(slice, seat, ctx) {
  const yaku = koiKoiYaku(slice.piles[seat], ctx)
  let points = yaku.reduce((n, [, v]) => n + v, 0)
  if (points >= 7) points *= 2
  if (slice.called.some((c, i) => c && i !== seat)) points *= 2
  return endRound(slice, seat, points, yaku.map(([n, v]) => `${n} ${v}`).join(', '), ctx)
}

// Go-Stop: the stopper is paid by each other player, with the penalties.
function stopGoStop(slice, seat, ctx) {
  const base = goStopScore(slice.piles[seat], ctx)
  const gos = slice.called[seat]
  let points = base + (gos >= 1 ? 1 : 0) + (gos >= 2 ? 1 : 0)
  if (gos >= 3) points *= 2 ** (gos - 2)
  points *= slice.stakes || 1
  const k = kinds(slice.piles[seat], ctx)
  const stacks = [...slice.chips]
  for (let other = 0; other < ctx.seats; other++) {
    if (other === seat) continue
    let pay = points
    // Gwang-bak: the winner scored brights and this player took none.
    if (k.brights.length >= 3 && !slice.piles[other].some(id => typeOf(ctx, id) === BRIGHT)) pay *= 2
    // Pi-bak: the winner scored junk and this player took fewer than six.
    if (junkCount(slice.piles[seat], ctx) >= 10 && junkCount(slice.piles[other], ctx) < 6) pay *= 2
    // Go-bak: this player called Go and did not stop.
    if (slice.called[other]) pay *= 2
    stacks[other] -= pay
    stacks[seat] += pay
  }
  const next = { ...slice, chips: stacks, stakes: 1, lastRound: { winner: seat, points, why: `${base} points${gos ? `, ${gos} go` : ''}` } }
  return nextRoundOrOver(next, seat, ctx)
}

function exhausted(slice, ctx) {
  const s = settings(ctx)
  if (s.scoring === 'points') {
    const totals = Array(s.sides).fill(0)
    slice.piles.forEach((pile, seat) => { totals[s.sideOf(seat)] += pile.reduce((n, id) => n + Number(s.values[typeOf(ctx, id)] || 0), 0) })
    const scores = slice.scores.map((v, i) => v + totals[i])
    const top = Math.max(...totals)
    const leaders = totals.map((v, i) => (v === top ? i : -1)).filter(i => i >= 0)
    const winnerSide = leaders.length === 1 ? leaders[0] : null
    const winner = winnerSide === null ? slice.dealer : (s.teams.length ? s.teams[winnerSide][0] : winnerSide)
    return nextRoundOrOver({ ...slice, scores, lastRound: { totals, winner: winnerSide === null ? null : winner, why: `card points ${totals.join('–')}` } }, winner, ctx)
  }
  if (s.scoring === 'yaku') {
    // Oya-ken: "the oya gains one point, and the next hand begins with the same oya".
    return endRound(slice, slice.dealer, 1, 'nobody made a yaku: one to the dealer', ctx)
  }
  // Nagari: nobody stopped; the same dealer deals and the next hand counts double.
  return deal({ ...slice, round: slice.round, stakes: 2, lastRound: { winner: null, why: 'nagari: nobody stopped' } }, ctx)
}

// --- capturing ------------------------------------------------------------------

// The table cards a card can take.
const matches = (field, id, ctx) => field.filter(f => monthOf(ctx, f) === monthOf(ctx, id))

function capture(slice, seat, id, target, ctx) {
  const found = matches(slice.field, id, ctx)
  if (!found.length) return { ...slice, field: [...slice.field, id], took: [] }
  const taken = found.length === 3 ? found : [target ?? found[0]]
  return {
    ...slice,
    field: slice.field.filter(f => !taken.includes(f)),
    piles: slice.piles.map((p, i) => (i === seat ? [...p, id, ...taken] : p)),
    took: [id, ...taken],
  }
}

// Go-Stop's special captures take a junk card from each other player.
function stealJunk(slice, seat, ctx) {
  const piles = slice.piles.map(p => [...p])
  for (let other = 0; other < piles.length; other++) {
    if (other === seat) continue
    const junk = piles[other].findIndex(id => typeOf(ctx, id) === PLAIN)
    if (junk >= 0) piles[seat].push(...piles[other].splice(junk, 1))
  }
  return { ...slice, piles }
}

function afterDraw(slice, seat, ctx) {
  const s = settings(ctx)
  if (s.scoring === 'yaku') {
    const now = koiKoiYaku(slice.piles[seat], ctx).reduce((n, [, v]) => n + v, 0)
    if (now > slice.lastScore[seat]) return { ...slice, phase: 'call', lastScore: slice.lastScore.map((v, i) => (i === seat ? now : v)), next: seat }
  }
  if (s.scoring === 'go-stop') {
    const now = goStopScore(slice.piles[seat], ctx)
    if (now >= s.threshold && now > slice.lastScore[seat]) return { ...slice, phase: 'call', lastScore: slice.lastScore.map((v, i) => (i === seat ? now : v)), next: seat }
  }
  return passOn(slice, seat, ctx)
}

function passOn(slice, seat, ctx) {
  if (slice.hands.every(h => !h.length)) return exhausted(slice, ctx)
  return { ...slice, phase: 'play', turn: null, next: (seat + 1) % ctx.seats }
}

function draw(slice, seat, ctx) {
  const s = settings(ctx)
  if (!slice.drawPile.length) return afterDraw(slice, seat, ctx)
  const [top, ...rest] = slice.drawPile
  const base = { ...slice, drawPile: rest, drawn: top }
  const found = matches(base.field, top, ctx)
  if (s.scoring === 'go-stop' && slice.turn) {
    const played = slice.turn.played
    const sameMonth = monthOf(ctx, top) === monthOf(ctx, played)
    // Ppeok: the drawn card is the third of a month just paired, with none of
    // it left on the table: all three stay there.
    if (slice.turn.took.length === 2 && sameMonth && !found.length) {
      const piles = base.piles.map((p, i) => (i === seat ? p.filter(id => !slice.turn.took.includes(id)) : p))
      return afterDraw({ ...base, piles, field: [...base.field, ...slice.turn.took, top], event: 'ppeok' }, seat, ctx)
    }
    // Ttadak: the played card took one of two on the table and the drawn card
    // is the fourth: it takes the last, and a junk card from each player.
    if (slice.turn.took.length === 2 && sameMonth && found.length === 1) {
      return afterDraw(stealJunk({ ...capture(base, seat, top, found[0], ctx), event: 'ttadak' }, seat, ctx), seat, ctx)
    }
    // Jjok: the played card lay alone and the drawn card takes it.
    if (!slice.turn.took.length && found.length === 1 && found[0] === played) {
      return afterDraw(stealJunk({ ...capture(base, seat, top, played, ctx), event: 'jjok' }, seat, ctx), seat, ctx)
    }
  }
  if (found.length === 2) return { ...base, phase: 'choose', next: seat }
  return afterDraw(capture(base, seat, top, null, ctx), seat, ctx)
}

export const fishing = {
  init(base, ctx) {
    const s = settings(ctx)
    // "Each player draws a single card - the player who draws a card from the
    // earliest month is the oya." Ties go to the first seat.
    const cut = createRng((ctx.seed || 1) >>> 0).shuffle(ctx.deck.map(c => c.id)).slice(0, ctx.seats)
    const months = cut.map(id => ctx.card(id).monthIndex)
    const dealer = months.indexOf(Math.min(...months))
    const slice = { seed: ctx.seed || 1, round: 0, dealer, scores: Array(s.sides).fill(0), finished: null }
    if (s.scoring === 'go-stop') slice.chips = Array(ctx.seats).fill(Number(ctx.config.chips?.start ?? 100))
    return deal(slice, ctx)
  },

  firstPlayer(slice) {
    return slice.next
  },

  legalMoves(slice, seat, ctx) {
    if (slice.phase === 'call') {
      const s = settings(ctx)
      return s.scoring === 'yaku' ? [{ action: 'stop' }, { action: 'koi-koi' }] : [{ action: 'stop' }, { action: 'go' }]
    }
    if (slice.phase === 'choose') {
      return matches(slice.field, slice.drawn, ctx).map(f => ({ action: 'take', value: ctx.card(f).display }))
    }
    // A card from hand: to the matching card it takes, or to the table.
    const out = []
    for (const id of slice.hands[seat]) {
      const found = matches(slice.field, id, ctx)
      if (found.length === 2) for (const f of found) out.push({ action: 'play', cards: [id], to: ctx.card(f).display })
      else out.push({ action: 'play', cards: [id], to: found.length ? 'capture' : 'table' })
    }
    return out
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    if (move.action === 'stop') return s.scoring === 'yaku' ? stopKoiKoi(slice, seat, ctx) : stopGoStop(slice, seat, ctx)
    if (move.action === 'koi-koi' || move.action === 'go') {
      return passOn({ ...slice, called: slice.called.map((n, i) => (i === seat ? n + 1 : n)) }, seat, ctx)
    }
    if (move.action === 'take') {
      const target = matches(slice.field, slice.drawn, ctx).find(f => ctx.card(f).display === move.value)
      return afterDraw(capture({ ...slice, phase: 'play' }, seat, slice.drawn, target, ctx), seat, ctx)
    }
    const id = move.cards[0]
    const found = matches(slice.field, id, ctx)
    const target = found.length === 2 ? found.find(f => ctx.card(f).display === move.to) : null
    const played = capture({ ...slice, hands: slice.hands.map((h, i) => (i === seat ? h.filter(c => c !== id) : h)), event: null }, seat, id, target, ctx)
    return draw({ ...played, turn: { played: id, took: played.took } }, seat, ctx)
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

  table(view, ctx) {
    const name = (seat) => ctx.names[seat] || `Player ${seat + 1}`
    const groups = [{ label: `The table · ${view.drawPile.length} to draw`, cards: view.field }]
    if (view.phase === 'choose') groups.push({ label: 'Drawn: choose which card it takes', cards: [view.drawn] })
    view.piles.forEach((pile, seat) => {
      if (pile.length) groups.push({ label: `${name(seat)} has taken ${pile.length}${view.called[seat] ? ` · ${view.called[seat]} call${view.called[seat] > 1 ? 's' : ''}` : ''}`, cards: pile })
    })
    if (view.lastRound) groups.push({ label: `Last hand: ${view.lastRound.winner === null || view.lastRound.winner === undefined ? 'no winner' : name(view.lastRound.winner)} · ${view.lastRound.why}`, cards: [] })
    return groups
  },

  describeSeat(view, seat, ctx) {
    const s = settings(ctx)
    const parts = []
    if (s.scoring === 'go-stop') parts.push(`${view.chips[seat]} chips`, `${goStopScore(view.piles[seat], ctx)} points`)
    else if (s.scoring === 'yaku') parts.push(`score ${view.scores[seat]}`, `hand ${view.round + 1} of ${s.rounds}`)
    else parts.push(`score ${view.scores[s.sideOf(seat)]}`)
    if (seat === view.dealer) parts.push('dealer')
    return parts.join(' · ')
  },

  result(slice, ctx) {
    if (slice.finished === null || slice.finished === undefined) return null
    const s = settings(ctx)
    const shown = ctx.displayNames || ctx.names
    if (slice.finished === 'draw') return 'A tie'
    if (s.scoring === 'go-stop') return `${shown[slice.finished]} finishes with the most chips, ${slice.chips[slice.finished]}`
    const side = s.sideOf(slice.finished)
    const who = s.teams.length ? s.teams[side].map(i => shown[i]).join(' & ') : shown[slice.finished]
    return `${who} ${s.teams.length ? 'win' : 'wins'} with ${slice.scores[side]}`
  },

  // Capture the most valuable card on offer; call stop once a hand is worth
  // taking, and koi-koi or go only while it is small.
  policy(view, seat, moves, ctx) {
    const s = settings(ctx)
    const worth = (id) => Number(s.values[typeOf(ctx, id)] || 1)
    if (view.phase === 'call') {
      const stop = moves.find(m => m.action === 'stop')
      return view.lastScore[seat] >= (s.scoring === 'yaku' ? 5 : s.threshold + 2) ? stop : (moves.find(m => m.action !== 'stop') || stop)
    }
    if (view.phase === 'choose') {
      const byValue = (m) => worth(matches(view.field, view.drawn, ctx).find(f => ctx.card(f).display === m.value))
      return moves.reduce((a, b) => (byValue(b) > byValue(a) ? b : a))
    }
    const gain = (m) => {
      const id = m.cards[0]
      const found = matches(view.field, id, ctx)
      if (!found.length) return -worth(id)
      const target = found.length === 2 ? found.find(f => ctx.card(f).display === m.to) : null
      return (found.length === 3 ? found : [target ?? found[0]]).reduce((n, f) => n + worth(f), 0) + worth(id)
    }
    return moves.reduce((a, b) => (gain(b) > gain(a) ? b : a))
  },

  describe(move, ctx) {
    if (move.action === 'play') return `plays ${ctx.card(move.cards[0])?.display || move.cards[0]}`
    if (move.action === 'take') return `takes ${move.value}`
    return move.action
  },
}
