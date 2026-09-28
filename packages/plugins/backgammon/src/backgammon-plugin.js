import { warnUnknownConfigKeys } from '../../../core/index.js'

export const CONFIG_KEYS = new Set([
  'setup', 'positions', 'movement', 'start', 'contact', 'doublingCube', 'gammons',
  'backgammons', 'aceyDeucey', 'headLimit', 'headDoubles', 'primeLimit', 'firstPast',
  'pinStartWins', 'openingRoll', 'games', 'cubeOwner', 'options', 'deal',
])

// The tables games (engine#150): backgammon and the seven games played on its
// board. One plugin plays all of them, and a variant is the handful of keys
// below in its frontmatter - the same way draughts has no variant code.
//
//   movement      opposite | same   which way the two sides travel
//   start         [w, b]            track index of each side's starting point;
//                                   defaults to the corners the movement implies
//   contact       hit | pin | block what landing on a lone opposing checker does:
//                                   send it to the bar, trap it beneath, or it
//                                   cannot be done because one checker holds a point
//   doublingCube  offer, take or drop a doubled stake before rolling
//   gammons       a loser who has borne nothing off pays double
//   backgammons   ...and triple with a checker on the bar or in the winner's home
//   aceyDeucey    1-2 is played, then a doublet of the player's choosing, then
//                 another roll
//   headLimit     checkers that may leave the starting point in one turn;
//   headDoubles   the opening doublets that may take one more (Nardi's 6-6, 4-4, 3-3)
//   primeLimit    no block this long with no opposing checker ahead of it
//   firstPast     no second checker leaves the start until one has passed the
//                 opponent's starting point (Fevga)
//   pinStartWins  pinning the opponent's last checker on its own starting point
//                 wins at once (Plakoto)
//   openingRoll   each side rolls one die and the higher plays both
//   games         games in a session: the box against a rotating team (Chouette)
//   cubeOwner     who holds the cube at the start: `box`, the first side, or
//                 nobody (the middle), which is the default
//
// A move is one checker moved by one die, `{from, to, die}`, and the turn
// continues until the dice are used. The dice are rolled from the game's own
// seeded generator by a `roll` move, so a game replays from its seed, and a
// roll that names its dice is played as that fall - which is how
// `chanceOutcomes` lets a search weigh every fall instead of the one it got.
//
// Points are named `point-1` to `point-N` along the track as the board draws
// them; each side's bar is `bar-0` or `bar-1` (by colour: 0 light, 1 dark), and
// bearing off goes `to: 'off'`. A cell holds `{owner, side, count}`: `owner`
// is the seat, `side` the colour, which differ only when a session seats more
// players than there are colours. A pinned checker is `under` the cell.
export function createBackgammonPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    positions: 24,
    movement: 'opposite',
    start: null,
    contact: 'hit',
    doublingCube: false,
    gammons: true,
    backgammons: true,
    aceyDeucey: false,
    headLimit: 0,
    headDoubles: [],
    primeLimit: 0,
    firstPast: false,
    pinStartWins: false,
    openingRoll: true,
    games: 1,
    cubeOwner: null,
  }
  const config = { ...defaults, ...variantConfig }
  warnUnknownConfigKeys('backgammon', variantConfig, CONFIG_KEYS)

  const N = Number(config.positions) || 24
  const HOME = Math.max(1, Math.round(N / 4))
  const same = config.movement === 'same'
  const start = Array.isArray(config.start) && config.start.length === 2
    ? config.start.map(Number)
    : [0, same ? N / 2 : N - 1]
  // Opposite sides travel away from their own corner; the same way, both go up.
  const dir = start.map(s => (same ? 1 : (s < N / 2 ? 1 : -1)))
  const games = Math.max(1, Number(config.games) || 1)
  const headDoubles = (Array.isArray(config.headDoubles) ? config.headDoubles : []).map(Number)

  const names = context.definition?.players?.names || context.definition?.players || ['white', 'black']
  const seats = Math.max(2, Array.isArray(names) ? names.length : 2)

  // A side's pips count down from N (its starting point) to 1 (deepest in its
  // home); 0 is borne off and N + 1 the bar.
  const mod = (a) => ((a % N) + N) % N
  const idxOf = (c, pip) => mod(start[c] + dir[c] * (N - pip))
  const pipOf = (c, idx) => N - mod((idx - start[c]) * dir[c])
  const cellId = idx => `point-${idx + 1}`

  let rng = null
  // Without the game's generator - a plugin built outside a game - every die
  // shows the same face rather than reaching for an unseeded one.
  const die = () => 1 + Math.floor((rng ? rng.next() : 0.5) * 6)

  // --- the opening position --------------------------------------------------

  function parseSetup(text) {
    const pos = emptyPos()
    for (const pair of String(text || '').split(',')) {
      const [where, what] = pair.split(':').map(s => (s || '').trim())
      // `5:1W/B`: a light checker holding a dark one pinned beneath it.
      const m = /^(\d+)([WB])(?:\/([WB]))?$/.exec(what || '')
      if (!m) continue
      const c = m[2] === 'W' ? 0 : 1
      const n = Number(m[1])
      // Acey-Deucey starts with every checker off the board, waiting to enter
      // exactly as a hit checker does, so both are held on the bar.
      if (where === 'home' || where === 'bar') { pos.bar[c] += n; continue }
      if (where === 'off') { pos.off[c] += n; continue }
      const idx = Number(where)
      if (!Number.isInteger(idx) || idx < 0 || idx >= N) continue
      pos.side[idx] = c
      pos.cnt[idx] += n
      if (m[3]) pos.under[idx] = m[3] === 'W' ? 0 : 1
    }
    return pos
  }

  function emptyPos() {
    return { side: new Array(N).fill(-1), cnt: new Array(N).fill(0), under: new Array(N).fill(-1), bar: [0, 0], off: [0, 0], head: 0 }
  }

  const OPENING = parseSetup(config.setup)
  const TOTAL = [0, 1].map(c => OPENING.bar[c] + OPENING.off[c]
    + OPENING.cnt.reduce((sum, n, i) => sum + (OPENING.side[i] === c ? n : 0) + (OPENING.under[i] === c ? 1 : 0), 0))

  // --- board <-> working position ----------------------------------------------

  function posOf(slice) {
    const pos = emptyPos()
    const board = slice.board || {}
    for (let i = 0; i < N; i++) {
      const cell = board[cellId(i)]
      if (!cell || !cell.count) continue
      pos.side[i] = cell.side
      pos.cnt[i] = cell.count
      if (cell.under !== undefined && cell.under !== null) pos.under[i] = cell.under
    }
    for (const c of [0, 1]) {
      const bar = board[`bar-${c}`]
      pos.bar[c] = bar ? bar.count : 0
    }
    pos.off = [...(slice.off || [0, 0])]
    pos.head = slice.headMoves || 0
    return pos
  }

  function boardOf(pos, sides) {
    const board = {}
    for (let i = 0; i < N; i++) {
      if (pos.cnt[i] > 0) {
        const cell = { type: 'checker', owner: sides[pos.side[i]], side: pos.side[i], count: pos.cnt[i] }
        if (pos.under[i] >= 0) cell.under = pos.under[i]
        board[cellId(i)] = cell
      } else {
        board[cellId(i)] = null
      }
    }
    for (const c of [0, 1]) {
      board[`bar-${c}`] = pos.bar[c] > 0 ? { type: 'checker', owner: sides[c], side: c, count: pos.bar[c] } : null
    }
    return board
  }

  function clonePos(pos) {
    return { side: pos.side.slice(), cnt: pos.cnt.slice(), under: pos.under.slice(), bar: pos.bar.slice(), off: pos.off.slice(), head: pos.head }
  }

  const keyOf = pos => `${pos.side.join('')}|${pos.cnt.join(',')}|${pos.under.join('')}|${pos.bar}|${pos.off}|${pos.head}`

  // --- where a checker may go ----------------------------------------------------

  // What a checker of colour `c` finds on landing at `idx`: open, a hit, a pin,
  // or closed.
  function landing(pos, c, idx) {
    const s = pos.side[idx]
    if (pos.cnt[idx] === 0) return 'open'
    if (s === c) return 'open'
    // A point holding a pinned checker already holds two colours.
    if (pos.under[idx] >= 0) return 'closed'
    if (config.contact === 'block') return 'closed'
    if (pos.cnt[idx] >= 2) return 'closed'
    return config.contact === 'pin' ? 'pin' : 'hit'
  }

  function allHome(pos, c) {
    if (pos.bar[c] > 0) return false
    for (let i = 0; i < N; i++) {
      const mine = (pos.side[i] === c ? pos.cnt[i] : 0) + (pos.under[i] === c ? 1 : 0)
      if (mine > 0 && pipOf(c, i) > HOME) return false
    }
    return true
  }

  function highestPip(pos, c) {
    let best = 0
    for (let i = 0; i < N; i++) if (pos.side[i] === c && pos.cnt[i] > 0) best = Math.max(best, pipOf(c, i))
    return best
  }

  function leftStart(pos, c) {
    let n = 0
    for (let i = 0; i < N; i++) if (pos.side[i] === c && pipOf(c, i) < N) n += pos.cnt[i]
    return n + pos.off[c] + pos.bar[c]
  }

  function passedOpponentStart(pos, c) {
    if (pos.off[c] > 0) return true
    const mark = pipOf(c, start[1 - c])
    for (let i = 0; i < N; i++) if (pos.side[i] === c && pos.cnt[i] > 0 && pipOf(c, i) < mark) return true
    return false
  }

  // A block of `primeLimit` points with nothing of the opponent's ahead of it
  // shuts the opponent in for good, which Nardi forbids.
  function illegalPrime(pos, c) {
    const L = Number(config.primeLimit) || 0
    if (!L) return false
    const o = 1 - c
    let run = 0
    let lowest = 0
    for (let q = 1; q <= N; q++) {
      const i = idxOf(o, q)
      if (pos.side[i] === c && pos.cnt[i] > 0) {
        if (run === 0) lowest = q
        run++
        if (run >= L) {
          let ahead = false
          for (let r = 1; r < lowest && !ahead; r++) {
            const j = idxOf(o, r)
            if ((pos.side[j] === o && pos.cnt[j] > 0) || pos.under[j] === o) ahead = true
          }
          if (!ahead) return true
        }
      } else run = 0
    }
    return false
  }

  function applyStep(pos, c, step) {
    const next = clonePos(pos)
    if (step.fromIdx < 0) {
      next.bar[c]--
    } else {
      const i = step.fromIdx
      next.cnt[i]--
      if (next.cnt[i] === 0) {
        if (next.under[i] >= 0) {
          // The last checker leaves and the one it held is free.
          next.side[i] = next.under[i]
          next.cnt[i] = 1
          next.under[i] = -1
        } else next.side[i] = -1
      }
      if (step.fromPip === N) next.head++
    }
    if (step.toIdx < 0) {
      next.off[c]++
      return next
    }
    const t = step.toIdx
    const found = landing(pos, c, t)
    if (found === 'hit') {
      next.bar[1 - c]++
      next.side[t] = c
      next.cnt[t] = 1
    } else if (found === 'pin') {
      next.under[t] = 1 - c
      next.side[t] = c
      next.cnt[t] = 1
    } else {
      next.side[t] = c
      next.cnt[t]++
    }
    return next
  }

  // Every way one die can move one checker, before the rules about using the
  // whole roll are applied.
  function rawSteps(pos, c, d, turn) {
    const out = []
    const add = (fromIdx, fromPip, toPip) => {
      const toIdx = toPip <= 0 ? -1 : idxOf(c, toPip)
      const step = { fromIdx, fromPip, toIdx, toPip: Math.max(0, toPip), die: d }
      if (toIdx >= 0) {
        const found = landing(pos, c, toIdx)
        if (found === 'closed') return
        step.effect = found
      }
      if (config.primeLimit && toIdx >= 0 && illegalPrime(applyStep(pos, c, step), c)) return
      out.push(step)
    }
    if (pos.bar[c] > 0) {
      add(-1, N + 1, N + 1 - d)
      return out
    }
    const home = allHome(pos, c)
    const top = home ? highestPip(pos, c) : 0
    const headCap = config.headLimit
      ? config.headLimit + (turn.first && turn.doublet && headDoubles.includes(turn.doublet) ? 1 : 0)
      : Infinity
    const restrictHead = config.firstPast && !passedOpponentStart(pos, c) && leftStart(pos, c) > 0
    for (let i = 0; i < N; i++) {
      if (pos.side[i] !== c || pos.cnt[i] === 0) continue
      const p = pipOf(c, i)
      if (p === N && (pos.head >= headCap || restrictHead)) continue
      const q = p - d
      if (q >= 1) add(i, p, q)
      else if (home && (q === 0 || p === top)) add(i, p, q)
    }
    return out
  }

  function without(dice, d) {
    const k = dice.indexOf(d)
    return k < 0 ? dice : [...dice.slice(0, k), ...dice.slice(k + 1)]
  }

  // A step that wins the game plays the whole roll: nothing is left to play.
  function wins(pos, c, step) {
    if (pos.off[c] >= TOTAL[c]) return true
    return !!config.pinStartWins && step.effect === 'pin' && step.toIdx === start[1 - c]
  }

  // How many of these dice this step, and the best play after it, can use.
  function usedBy(pos, c, dice, step, turn, memo) {
    const after = applyStep(pos, c, step)
    return wins(after, c, step) ? dice.length : 1 + maxUsable(after, c, without(dice, step.die), turn, memo)
  }

  function maxUsable(pos, c, dice, turn, memo) {
    if (!dice.length) return 0
    const key = keyOf(pos) + '#' + dice.join('')
    if (memo.has(key)) return memo.get(key)
    let best = 0
    for (const d of new Set(dice)) {
      for (const step of rawSteps(pos, c, d, turn)) {
        best = Math.max(best, usedBy(pos, c, dice, step, turn, memo))
        if (best === dice.length) break
      }
      if (best === dice.length) break
    }
    memo.set(key, best)
    return best
  }

  // The steps that can begin a legal play of the dice that are left: as many
  // dice as can be used must be used, and where only one of two can, the
  // larger.
  function legalSteps(pos, c, dice, turn) {
    if (!dice.length) return []
    const memo = new Map()
    const candidates = []
    for (const d of new Set(dice)) for (const step of rawSteps(pos, c, d, turn)) candidates.push(step)
    if (!candidates.length) return []
    const most = maxUsable(pos, c, dice, turn, memo)
    let legal = candidates.filter(step => usedBy(pos, c, dice, step, turn, memo) === most)
    if (most === 1 && dice.length === 2 && dice[0] !== dice[1]) {
      const larger = Math.max(...dice)
      if (legal.some(s => s.die === larger)) legal = legal.filter(s => s.die === larger)
    }
    // The winning checker is not a question of which die took it.
    const winning = new Set()
    return legal.filter(step => {
      if (!wins(applyStep(pos, c, step), c, step)) return true
      const key = `${step.fromIdx}>${step.toIdx}`
      if (winning.has(key)) return false
      winning.add(key)
      return true
    })
  }

  const turnOf = (slice, c) => ({
    first: (slice.turns?.[c] || 0) <= 1,
    doublet: Array.isArray(slice.rolled) && slice.rolled[0] === slice.rolled[1] ? slice.rolled[0] : null,
  })

  function toMove(step, c) {
    return {
      from: step.fromIdx < 0 ? `bar-${c}` : cellId(step.fromIdx),
      to: step.toIdx < 0 ? 'off' : cellId(step.toIdx),
      die: step.die,
    }
  }

  // --- the turn ------------------------------------------------------------------

  const colourOf = (slice, seat) => {
    const c = slice.sides.indexOf(seat)
    return c < 0 ? 0 : c
  }

  function cubeAvailable(slice, c) {
    return !!config.doublingCube && !slice.extraRoll && slice.cube < 64
      && (slice.cubeOwner === null || slice.cubeOwner === c)
  }

  function rollDice(move) {
    const given = move && move.dice
    if (Array.isArray(given) && given.length === 2 && given.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) return [...given]
    return [die(), die()]
  }

  function openingDice(move) {
    const given = move && move.dice
    if (Array.isArray(given) && given.length === 2 && given[0] !== given[1]
        && given.every(v => Number.isInteger(v) && v >= 1 && v <= 6)) return [...given]
    let a = die(), b = die()
    while (a === b) { a = die(); b = die() }
    return [a, b]
  }

  // Once the dice in hand are played or cannot be: the acey-deucey doublet is
  // chosen, the extra roll is taken, or the turn passes.
  function afterDice(slice) {
    if (slice.bonus) return { ...slice, dice: [], bonus: false, phase: 'choose' }
    if (slice.again) return { ...slice, dice: [], again: false, phase: 'roll', extraRoll: true }
    const c = colourOf(slice, slice.toMove)
    return { ...slice, dice: [], phase: 'roll', extraRoll: false, toMove: slice.sides[1 - c], headMoves: 0 }
  }

  // Dice in hand with nothing they can do are forfeited.
  function settle(slice) {
    if (slice.phase !== 'move') return slice
    const c = colourOf(slice, slice.toMove)
    if (slice.dice.length && legalSteps(posOf(slice), c, slice.dice, turnOf(slice, c)).length) return slice
    return afterDice(slice)
  }

  function startTurn(slice, c, values) {
    const turns = [...(slice.turns || [0, 0])]
    turns[c]++
    const bonus = !!config.aceyDeucey && values.includes(1) && values.includes(2)
    const dice = values[0] === values[1] ? [values[0], values[0], values[0], values[0]] : [...values]
    return settle({ ...slice, turns, rolled: values, dice, phase: 'move', bonus, headMoves: 0, toMove: slice.sides[c] })
  }

  function score(pos, winner, cube) {
    const loser = 1 - winner
    let kind = 'single', mult = 1
    if (config.gammons && pos.off[loser] === 0) {
      kind = 'gammon'; mult = 2
      if (config.backgammons) {
        let trapped = pos.bar[loser] > 0
        for (let i = 0; i < N && !trapped; i++) {
          const mine = (pos.side[i] === loser && pos.cnt[i] > 0) || pos.under[i] === loser
          if (mine && pipOf(winner, i) <= HOME) trapped = true
        }
        if (trapped) { kind = 'backgammon'; mult = 3 }
      }
    }
    return { kind, points: cube * mult }
  }

  // A game is over. In a session the box and the team settle, the seats rotate
  // and the next game begins; otherwise the result stands.
  function finish(slice, winner, outcome) {
    const result = { winner, winnerSeat: slice.sides[winner], ...outcome }
    const scores = [...slice.scores]
    const box = slice.sides[0]
    const team = [slice.sides[1], ...slice.line]
    const sign = winner === 0 ? 1 : -1
    scores[box] += sign * outcome.points * team.length
    for (const seat of team) scores[seat] -= sign * outcome.points
    const last = slice.game >= games
    if (last) return { ...slice, scores, result, phase: 'done', dice: [], toMove: slice.toMove }
    // The box keeps its seat by winning; losing, the captain takes it.
    const line = [...slice.line]
    let sides
    if (winner === 0) {
      line.push(slice.sides[1])
      sides = [box, line.shift()]
    } else {
      line.push(box)
      sides = [slice.sides[1], line.shift()]
    }
    return {
      ...fresh(sides, line),
      scores,
      game: slice.game + 1,
      lastResult: result,
    }
  }

  function fresh(sides, line) {
    return {
      board: boardOf(OPENING, sides),
      off: [...OPENING.off],
      dice: [],
      rolled: null,
      phase: config.openingRoll ? 'opening' : 'roll',
      toMove: sides[0],
      sides,
      line,
      cube: 1,
      cubeOwner: config.cubeOwner === 'box' ? 0 : null,
      bonus: false,
      again: false,
      extraRoll: false,
      headMoves: 0,
      turns: [0, 0],
      result: null,
    }
  }

  function checkEnd(slice, c, pos, step) {
    if (!wins(pos, c, step)) return null
    if (pos.off[c] >= TOTAL[c]) return finish(slice, c, score(pos, c, slice.cube))
    return finish(slice, c, { kind: 'pinned', points: slice.cube * 2 })
  }

  // --- the AI -------------------------------------------------------------------

  function pips(pos, c) {
    let total = pos.bar[c] * (N + 1)
    for (let i = 0; i < N; i++) {
      if (pos.side[i] === c) total += pos.cnt[i] * pipOf(c, i)
      if (pos.under[i] === c) total += pipOf(c, i)
    }
    return total
  }

  // A position as the side `c` sees it. The race is the pip count; the rest is
  // what every tables game rewards: points held, the more so at home, blots
  // left where they can be hit, checkers borne off and the opponent on the bar.
  function evaluatePos(pos, c, difficulty) {
    const o = 1 - c
    let value = (pips(pos, o) - pips(pos, c)) + (pos.off[c] - pos.off[o]) * 2
    if (difficulty === 'easy') return value
    const hits = config.contact === 'hit'
    for (let i = 0; i < N; i++) {
      const n = pos.cnt[i]
      if (!n) continue
      const s = pos.side[i]
      const p = pipOf(s, i)
      const sign = s === c ? 1 : -1
      const held = config.contact === 'block' ? n >= 1 : n >= 2
      if (held) value += sign * (p <= HOME ? 4 : 2)
      if (pos.under[i] >= 0) value += (pos.under[i] === c ? -8 : 8)
      if (hits && n === 1) {
        // A blot the other side can reach: any of its checkers behind it.
        const other = 1 - s
        let threat = pos.bar[other] > 0
        for (let j = 0; j < N && !threat; j++) {
          if (pos.side[j] !== other || !pos.cnt[j]) continue
          const gap = pipOf(other, j) - pipOf(other, i)
          if (gap > 0 && gap <= 12) threat = true
        }
        if (threat) value -= sign * (3 + (N - p) / 6)
      }
    }
    value += (pos.bar[o] - pos.bar[c]) * 6
    return value
  }

  // Every complete play of the dice left, from here: the final position and
  // the first step that begins it.
  function plays(pos, c, dice, turn) {
    const found = new Map()
    const seen = new Set()
    const walk = (p, left, first) => {
      const key = keyOf(p) + '#' + left.join('')
      if (seen.has(key)) return
      seen.add(key)
      const steps = legalSteps(p, c, left, turn)
      if (!steps.length) {
        const k = keyOf(p)
        if (!found.has(k)) found.set(k, { pos: p, first })
        return
      }
      for (const step of steps) walk(applyStep(p, c, step), without(left, step.die), first || step)
    }
    walk(pos, dice, null)
    return [...found.values()]
  }

  // The chance node, searched one roll deep: a play is worth what it leaves
  // after each of the opponent's 21 rolls, answered as well as the opponent
  // can, weighted by how likely that roll is. Only the best few plays by the
  // static judgement are searched, which is where the time goes.
  const LOOKAHEAD = { hard: 4, expert: 8 }
  const ROLLS = []
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push([a, b, a === b ? 1 / 36 : 2 / 36])

  function expectedAfterReply(pos, c, difficulty) {
    const o = 1 - c
    const theirs = { ...pos, head: 0 }
    let total = 0
    for (const [a, b, chance] of ROLLS) {
      const dice = a === b ? [a, a, a, a] : [a, b]
      let best = -Infinity
      for (const reply of plays(theirs, o, dice, { first: false, doublet: a === b ? a : null })) {
        best = Math.max(best, evaluatePos(reply.pos, o, difficulty))
      }
      if (best === -Infinity) best = evaluatePos(theirs, o, difficulty)
      total += chance * -best
    }
    return total
  }

  // How likely the side to roll is to win a race, from the pip counts alone.
  function raceChance(pos, c) {
    const mine = pips(pos, c), theirs = pips(pos, 1 - c)
    const lead = theirs - mine + 4
    const spread = Math.max(6, Math.sqrt(mine + theirs) * 1.4)
    return 1 / (1 + Math.exp(-lead / spread))
  }

  function policy(slice, seat, moves, opts = {}) {
    const difficulty = opts.difficulty || 'medium'
    if (!moves.length) return null
    if (difficulty === 'beginner') return opts.random ? moves[Math.floor(opts.random() * moves.length)] : moves[0]
    const c = colourOf(slice, seat)
    const pos = posOf(slice)
    const byAction = a => moves.find(m => m.action === a)
    if (slice.phase === 'respond') return raceChance(pos, 1 - c) > 0.76 ? byAction('drop') : byAction('take')
    if (slice.phase === 'roll' || slice.phase === 'opening') {
      const chance = raceChance(pos, c)
      if (byAction('double') && chance > 0.68 && chance < 0.9) return byAction('double')
      return byAction('roll') || moves[0]
    }
    if (slice.phase === 'choose') {
      let best = moves[0], bestValue = -Infinity
      for (const move of moves) {
        const n = Number(String(move.action).slice(7))
        for (const play of plays(pos, c, [n, n, n, n], turnOf(slice, c))) {
          const value = evaluatePos(play.pos, c, difficulty)
          if (value > bestValue) { bestValue = value; best = move }
        }
      }
      return best
    }
    const ranked = plays(pos, c, slice.dice, turnOf(slice, c))
      .filter(play => play.first)
      .map(play => ({ ...play, value: evaluatePos(play.pos, c, difficulty) }))
      .sort((a, b) => b.value - a.value)
    const deeper = LOOKAHEAD[difficulty] || 0
    // The searched plays are compared with each other only: a value after the
    // opponent's reply is not on the same scale as one before it.
    const chosen = deeper > 1 && ranked.length > 1
      ? ranked.slice(0, deeper).map(play => ({ ...play, value: expectedAfterReply(play.pos, c, difficulty) })).sort((a, b) => b.value - a.value)
      : ranked
    const best = chosen.length ? chosen[0].first : null
    if (!best) return moves[0]
    const wanted = toMove(best, c)
    return moves.find(m => m.from === wanted.from && m.to === wanted.to && m.die === wanted.die) || moves[0]
  }

  // A move in words: the dice, the checker and what it landed on.
  function describeAction(move, prev, next) {
    switch (move.action) {
      case 'roll': {
        if (prev && prev.phase === 'opening' && Array.isArray(next.opening)) {
          return `opening roll ${next.opening[0]}-${next.opening[1]}`
        }
        const dice = Array.isArray(next.rolled) ? next.rolled.join('-') : '?'
        return next.phase === 'roll' || next.toMove !== prev?.toMove ? `roll ${dice}, no move` : `roll ${dice}`
      }
      case 'double': return `double to ${(prev?.cube || 1) * 2}`
      case 'take': return `take, cube at ${next.cube}`
      case 'drop': return 'drop'
      default: break
    }
    if (typeof move.action === 'string' && move.action.startsWith('choose ')) return `choose ${move.action.slice(7)}s`
    // Points are numbered as the mover counts them, 24 down to 1, which is
    // how backgammon is written; the track's own number where the mover is
    // not known.
    const bar = /^bar-(\d)$/.exec(String(move.from))
    const cell = prev?.board?.[move.from]
    const c = bar ? Number(bar[1]) : (cell ? cell.side : null)
    const where = id => {
      if (id === 'off') return 'off'
      if (String(id).startsWith('bar')) return 'bar'
      const idx = Number(String(id).replace('point-', '')) - 1
      return String(c === null ? idx + 1 : pipOf(c, idx))
    }
    const effect = next.lastStep?.effect
    const mark = effect === 'hit' ? '*' : effect === 'pin' ? ' pins' : ''
    return `${where(move.from)}/${where(move.to)}${mark}`
  }

  // --- the plugin ---------------------------------------------------------------

  function legalMoves(slice) {
    if (!slice || slice.phase === 'done') return []
    const c = colourOf(slice, slice.toMove)
    switch (slice.phase) {
      case 'opening': return [{ action: 'roll' }]
      case 'roll': {
        const moves = [{ action: 'roll' }]
        if (cubeAvailable(slice, c)) moves.push({ action: 'double' })
        return moves
      }
      case 'respond': return [{ action: 'take' }, { action: 'drop' }]
      case 'choose': return [1, 2, 3, 4, 5, 6].map(n => ({ action: `choose ${n}` }))
      case 'move': return legalSteps(posOf(slice), c, slice.dice, turnOf(slice, c)).map(s => toMove(s, c))
      default: return []
    }
  }

  function sameMove(a, b) {
    return a.action === b.action && a.from === b.from && a.to === b.to && a.die === b.die
  }

  function play(move, slice) {
    const c = colourOf(slice, slice.toMove)
    switch (move.action) {
      case 'roll': {
        if (slice.phase === 'opening') {
          // One die each; the higher plays both.
          const [a, b] = openingDice(move)
          const first = a > b ? 0 : 1
          return startTurn({ ...slice, opening: [a, b] }, first, first === 0 ? [a, b] : [b, a])
        }
        return startTurn({ ...slice, extraRoll: false }, c, rollDice(move))
      }
      case 'double':
        return { ...slice, phase: 'respond', toMove: slice.sides[1 - c], offeredBy: c }
      case 'take':
        return { ...slice, phase: 'roll', cube: slice.cube * 2, cubeOwner: c, toMove: slice.sides[1 - c], offeredBy: null }
      case 'drop':
        return finish({ ...slice, offeredBy: null }, 1 - c, { kind: 'dropped', points: slice.cube })
      default:
        break
    }
    if (typeof move.action === 'string' && move.action.startsWith('choose ')) {
      const n = Number(move.action.slice(7))
      return settle({ ...slice, dice: [n, n, n, n], again: true, phase: 'move', rolled: [n, n], chosen: n })
    }
    // A checker moved by one die.
    const pos = posOf(slice)
    const step = legalSteps(pos, c, slice.dice, turnOf(slice, c)).find(s => sameMove(toMove(s, c), move))
    if (!step) return slice
    const after = applyStep(pos, c, step)
    const moved = {
      ...slice,
      board: boardOf(after, slice.sides),
      off: after.off,
      headMoves: after.head,
      dice: without(slice.dice, step.die),
      lastStep: { ...toMove(step, c), effect: step.effect || null },
    }
    const ended = checkEnd(moved, c, after, step)
    if (ended) return ended
    return settle(moved)
  }

  return {
    sliceName: 'backgammon',
    // `play` builds every slice it returns and never writes to the one it is
    // handed; `applymove-is-pure.test.js` holds it to that.
    pureApplyMove: true,
    pieceTypes: ['checker'],
    vocabulary: { checker: { symbols: { 0: 'W', 1: 'B' } } },
    config,

    init(pluginConfig, { request } = {}) {
      rng = request ? request('core.rng') : null
      const line = []
      for (let s = 2; s < seats; s++) line.push(s)
      return { ...fresh([0, 1], line), scores: new Array(seats).fill(0), game: 1, lastResult: null }
    },

    getLegalMoves(slice) {
      return legalMoves(slice)
    },

    validateMove(move, slice) {
      if (move.action === 'resign') return true
      return legalMoves(slice).some(m => sameMove(m, move))
    },

    applyMove(move, slice) {
      if (!legalMoves(slice).some(m => sameMove(m, move))) return slice
      const next = play(move, slice)
      return { state: next, continueTurn: next.phase !== 'done' && next.toMove === slice.toMove }
    },

    // Who acts next is the plugin's to say: the side that lost the opening
    // roll plays first with the dice, a double is answered by the other side,
    // and a session seats a new box and captain between games.
    turnEffects(slice) {
      if (!slice || slice.phase === 'done') return null
      return { next: slice.toMove }
    },

    checkWin(slice) {
      if (!slice || slice.phase !== 'done' || !slice.result) return null
      if (games === 1) return slice.result.winnerSeat
      const best = Math.max(...slice.scores)
      const leaders = slice.scores.map((s, seat) => [s, seat]).filter(([s]) => s === best)
      return leaders.length === 1 ? leaders[0][1] : 'draw'
    },

    // What chance decides: for a roll, every fall of the dice that plays
    // differently, and how likely it is. A search weighs a roll by these.
    chanceOutcomes(move, slice) {
      if (move.action !== 'roll') return null
      const out = []
      if (slice && slice.phase === 'opening') {
        for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
          if (a !== b) out.push({ move: { ...move, dice: [a, b] }, probability: 1 / 30 })
        }
        return out
      }
      for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) {
        out.push({ move: { ...move, dice: [a, b] }, probability: a === b ? 1 / 36 : 2 / 36 })
      }
      return out
    },

    evaluate(slice, seat) {
      if (!slice || !slice.sides) return 0
      return evaluatePos(posOf(slice), colourOf(slice, seat), 'medium')
    },

    policy,

    describeSeat(slice, seat) {
      if (!slice || !slice.sides) return null
      const c = slice.sides.indexOf(seat)
      const parts = []
      if (games > 1) {
        parts.push(c === 0 ? 'box' : c === 1 ? 'captain' : 'team')
        parts.push(`${slice.scores[seat] >= 0 ? '+' : ''}${slice.scores[seat]}`)
        parts.push(`game ${Math.min(slice.game, games)}/${games}`)
      }
      if (c >= 0) {
        const pos = posOf(slice)
        parts.push(`pips ${pips(pos, c)}`)
        if (pos.bar[c]) parts.push(`${pos.bar[c]} on the bar`)
        if (pos.off[c]) parts.push(`${pos.off[c]} off`)
        if (config.doublingCube && slice.cubeOwner === c) parts.push(`cube ${slice.cube}`)
        if (slice.toMove === seat && slice.dice.length) parts.push(`to play ${slice.dice.join(' ')}`)
      }
      return parts.join(' · ')
    },

    // What the log says. The game's end is said on the move that ends it,
    // because in a session the next game has already been set up by then.
    describeMove(move, prev, next) {
      if (!next) return null
      const text = describeAction(move, prev, next)
      const ended = next.result || (prev && next.game > prev.game ? next.lastResult : null)
      if (!ended || !text) return text
      const how = ended.kind === 'single' ? 'wins' : ended.kind === 'dropped' ? 'wins, the double dropped' : ended.kind === 'pinned' ? 'wins by pinning the last checker at home' : `wins a ${ended.kind}`
      return `${text} - ${ended.winner === 0 ? 'white' : 'black'} ${how} (${ended.points})`
    },
  }
}

createBackgammonPlugin.interaction = 'move'
createBackgammonPlugin.configKeys = CONFIG_KEYS
