#!/usr/bin/env node
/**
 * Variant puzzle generator — correct by construction.
 *
 * The shipped variant pool (api/puzzles/index.json, key `variants`) was not
 * produced by playing the variants: 196 of its 758 records carry FEN letters
 * the variant never declares and 22 promote to pieces that are not promotable
 * anywhere. This generator exists so that never happens again, and it is built
 * so that it CANNOT happen: every record it emits was produced by the variant's
 * own plugin, and is then re-derived from its own serialised form and replayed
 * before it is allowed into the output.
 *
 * The whole design rests on one decision: no evaluator, no "best move". The
 * only puzzle shape emitted is one that is decidable by exhaustive replay:
 *
 *   WIN-IN-1 — from `position`, exactly one turn available to the side to move
 *   ends the game in that side's favour, and every other turn does not.
 *
 * "Turn", not "move", because some families (draughts capture chains,
 * progressive chess) keep the same player on move; a turn is the whole sequence
 * up to the point where the engine hands the turn over. "Ends the game in that
 * side's favour", not "checkmate", because the win condition is the plugin's
 * business: chess and xiangqi mate, draughts strips the opponent of pieces or
 * moves, reversi runs the board out with more discs, shogi catches the king.
 * The generator never asks what the win condition is — it asks the engine
 * whether `execute()` reported this player as the winner. That is why the same
 * ~40 lines of search work for five families.
 *
 * Three properties are enforced on every position before a puzzle can come from
 * it, and again on every record after it is built:
 *
 *   1. FIDELITY. Positions are found by playing a real game forward, but the
 *      record can only carry a FEN. A FEN drops anything the plugin keeps
 *      outside the board — shogi hands, go ko history. So the position is
 *      serialised, re-loaded into a *fresh* game, and the two legal move sets
 *      are compared move for move. If they differ, the FEN does not describe
 *      the position that was actually reached and the position is discarded.
 *      This is what stops "shogi puzzle where the captured pieces evaporated".
 *
 *   2. UNIQUENESS. Every turn is tried. Exactly one may win. Zero is not a
 *      puzzle; two is not a puzzle either, and shipping one is how a corpus
 *      ends up full of positions with a "solution" that is merely *a* answer.
 *
 *   3. RESOLVABILITY. The recorded notation must pick out exactly one legal
 *      move — the engine's own `findLegalMove` is used, so a record that this
 *      repo's puzzle test cannot resolve is never written.
 *
 * Verification (`verifyRecord`) re-does all of it from the record alone: fresh
 * game, load `position`, check every board symbol against the plugin's declared
 * vocabulary, check any promotion suffix against `config.promotionChoices`,
 * resolve the solution through `findLegalMove`, replay it, confirm the engine
 * reports the mover as winner, then re-enumerate every other turn to confirm
 * none of them win. A record that fails any of that is dropped, not fixed up.
 *
 * What it does NOT do, so nobody has to find out the hard way:
 *   - No mate-in-2. The shape is verifiable the same way (for every opponent
 *     reply a mate exists) but it costs turns × replies × turns replays, and
 *     mate-in-1 is not yet mined out.
 *   - No go. The go plugin keeps colour strings in the board and
 *     topology-grid#serializePosition passes strings through untouched, so a go
 *     position serialises to "…14black…" and parsePosition cannot read it back.
 *     Until that round trip works, every go variant is skipped with that reason
 *     rather than emitting a FEN nothing can load.
 *   - No shogi drops. A FEN has nowhere to put the hand, so only the
 *     capture-free (empty-hand) part of shogi survives the fidelity check.
 *   - Placement families (reversi) need --allow-placement, because their
 *     solution is a bare square and fen.js#findLegalMove throws on it.
 *
 * Usage:
 *   node scripts/generate-puzzles.mjs --family=chess --variant=half-chess --count=10 --seed=42
 *   node scripts/generate-puzzles.mjs --family=chess --all --count=1 --seed=11 --out=out.json
 *   node scripts/generate-puzzles.mjs --family=draughts --variant=english --count=5 --min-distractors=1
 *
 * Options: --family (comma list) --variant --all --count --seed --out --quiet
 *          --positions (search budget per variant) --min-ply --min-distractors
 *          --max-plies --allow-placement
 *
 * Output is JSON on stdout ({ meta, puzzles }) so it composes with jq; stats go
 * to stderr. --out=PATH writes the JSON to a file instead.
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { setRulesReader } from '../packages/play/src/play.js'
import '../packages/plugins/chess/index.js'
import { listVariants } from '../packages/play/src/variant-registry.js'
import { createGameForVariant, loadFen, toFen, findLegalMove, writeMove } from '../packages/play/src/fen.js'
import { getPlugin } from '../packages/play/src/play.js'
import { createAI } from '../packages/play/src/sdk.js'
import { boardToSetup } from '../packages/play/src/serialise.js'
import { createRng } from '../packages/core/src/rng.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── rules source ────────────────────────────────────────────────────────────
// Same contract as packages/play/test-helpers/setup-rules-reader.js, but rooted
// at the repo rather than at process.cwd() so the script runs from anywhere.
const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(ROOT, '..', 'moddable-rules', 'games')

setRulesReader(
  (family, slug) => {
    const path = slug === 'rulebook'
      ? join(RULES_ROOT, family, 'content', 'rulebook.md')
      : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`)
    return readFileSync(path, 'utf8')
  },
  (family) => {
    const dir = join(RULES_ROOT, family, 'content', 'variants')
    try {
      return readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
    } catch {
      return []
    }
  },
)

// ── CLI ─────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  family: 'chess',
  variant: null,
  all: false,
  count: 10,
  seed: 42,
  positions: 4000,   // positions scanned per variant before giving up
  minPly: 6,         // ignore the first N plies of a playout; opening mates are noise
  minDistractors: 2, // a position with only the winning turn to choose from is not a puzzle
  maxPlies: 160,     // plies per playout before restarting
  out: null,
  quiet: false,
  allowPlacement: false, // emit reversi/go-style square-only solutions this repo cannot resolve yet
  policy: 'sharp',       // sharp: fewest replies, as below; ai: the family's own AI at its weakest level
  shape: null,           // win | best | win2; default: a win where one exists, else the family's own objective
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS }
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.startsWith('--') ? arg.slice(2).split('=') : [null, null]
    if (!rawKey) throw new Error(`Unrecognised argument "${arg}"`)
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (!(key in DEFAULTS)) throw new Error(`Unknown option "--${rawKey}"`)
    if (typeof DEFAULTS[key] === 'boolean') opts[key] = rawValue === undefined ? true : rawValue !== 'false'
    else if (typeof DEFAULTS[key] === 'number') opts[key] = Number(rawValue)
    else opts[key] = rawValue
  }
  if (!opts.all && !opts.variant) opts.all = false
  return opts
}

// ── fresh-game discipline ───────────────────────────────────────────────────
// loadFen merges the board into the slice that is already there, so a game
// object reused for a second position inherits everything the FEN does not
// carry: shogi hands, go ko history, a draughts chain in progress. Reusing one
// game is necessary (building one costs a frontmatter read), so every load
// first restores the slice the plugin produced at init. Without this a probe
// game can agree with a live game only because both are carrying the same stale
// hand, and a record gets written for a position a consumer would never see.

const PRISTINE = new WeakMap()

function freshGame(family, variant, opts) {
  const game = createGameForVariant(family, variant, opts)
  const state = game.getState()
  PRISTINE.set(game, { slice: structuredClone(state.slice), players: structuredClone(state.players) })
  return game
}

/**
 * Put a game back at its opening position without paying for another
 * frontmatter read. Playouts are cheap; building a game is not, and in families
 * where most positions get rejected (shogi, where anything after a capture is
 * not FEN-representable) the run is dominated by how fast a playout can restart.
 */
function resetGame(game) {
  const pristine = PRISTINE.get(game)
  if (!pristine) return game
  game.loadState({ slice: structuredClone(pristine.slice), players: structuredClone(pristine.players) })
  return game
}

/**
 * A position, loaded into a game reset to its opening slice first. A position is
 * a FEN where the family's FEN carries the game exactly, and otherwise the
 * engine's own snapshot: a mancala board of seed counts, a morris board and hex
 * stones do not survive a FEN, and their families had no puzzles because every
 * playout stopped at the first position that did not.
 */
function loadPosition(game, position) {
  const pristine = PRISTINE.get(game)
  if (typeof position !== 'string') {
    game.loadState(structuredClone(position))
    return game
  }
  if (pristine) game.loadState({ slice: structuredClone(pristine.slice) })
  loadFen(game, position)
  return game
}

function snapshot(game) {
  const state = game.getState()
  return { slice: structuredClone(state.slice), players: structuredClone(state.players) }
}

function positionKey(position) {
  return typeof position === 'string' ? position : JSON.stringify(position)
}

// ── board <-> notation helpers ──────────────────────────────────────────────
// Everything is derived from the variant's own topology and vocabulary; nothing
// here assumes 8x8, assumes files stop at h, or assumes a chess piece set.

function dimsOf(game) {
  const topo = game.topology
  if (!topo || topo.rows === undefined) return null
  return { rows: topo.rows, cols: topo.cols }
}

function indexToSquare(index, rows, cols) {
  const r = Math.floor(index / cols)
  const c = index % cols
  return String.fromCharCode(97 + c) + (rows - r)
}

function pluginOf(game) {
  const plugins = game.raw.registry.getPlugins()
  return plugins.find(p => p.sliceName === game.getState().family) || plugins[0]
}

/** Every letter the variant declares. A FEN symbol outside this set is a defect. */
function vocabularySymbols(plugin) {
  const symbols = new Set()
  for (const def of Object.values(plugin.vocabulary || {})) {
    for (const symbol of Object.values(def.symbols || {})) {
      if (typeof symbol === 'string') symbols.add(symbol)
    }
  }
  return symbols
}

/** The pieces this variant will actually promote to, by declared symbol. */
function promotableSymbols(plugin) {
  const raw = plugin.config?.promotionChoices
  const types = new Set()
  if (Array.isArray(raw)) raw.forEach(t => types.add(t))
  else if (raw && typeof raw === 'object') Object.values(raw).forEach(list => (list || []).forEach(t => types.add(t)))
  const symbols = new Set()
  for (const type of types) {
    for (const symbol of Object.values(plugin.vocabulary?.[type]?.symbols || {})) {
      if (typeof symbol === 'string') symbols.add(symbol.toLowerCase())
    }
  }
  return symbols
}

/**
 * Engine move -> the notation a record carries.
 * from/to families (chess, shogi, xiangqi, draughts) get UCI, which is what the
 * shipped pool uses and what fen.js#findLegalMove parses. Promotion is written
 * as the variant's own lowercased symbol for the promoted type, so Grand Chess
 * writes "c" for a chancellor because that is the letter grand declares.
 * Placement families (reversi, go) have no from-square, so the target square
 * alone is the move; those are marked `notation: "square"` on the record.
 */
export function moveToNotation(move, rows, cols, plugin, legal = null) {
  // A move with no square notation is written as itself, which findLegalMove
  // reads back by its fields.
  const written = () => ({ text: writeMove(move, legal), needsUniqueFromTo: false, written: true })
  const hexCell = v => typeof v === 'string' && v.includes(',')
  if (move.from !== undefined && move.to !== undefined && (typeof move.from === 'number' || hexCell(move.from))) {
    if (typeof move.from === 'string') {
      let text = move.from + '>' + move.to
      if (move.promotion) {
        const symbol = plugin.vocabulary?.[move.promotion]?.symbols?.[0]
        if (!symbol) return null
        text += String(symbol).toLowerCase()
      }
      return { text, needsUniqueFromTo: false, hex: true }
    }
    let text = indexToSquare(move.from, rows, cols) + indexToSquare(move.to, rows, cols)
    if (move.promotion) {
      const symbol = plugin.vocabulary?.[move.promotion]?.symbols?.[0]
      if (!symbol) return null
      text += String(symbol).toLowerCase()
    } else if (move.promote) {
      return { text, needsUniqueFromTo: true }
    }
    return { text, needsUniqueFromTo: false }
  }
  if (move.coord !== undefined && typeof move.coord === 'number' && rows) {
    return { text: indexToSquare(move.coord, rows, cols), placement: true }
  }
  return written()
}

/**
 * Resolve a recorded notation back to exactly one legal move.
 * The engine's own findLegalMove does the work for from/to families, so a record
 * that resolves here resolves in packages/play/__tests__/puzzles.test.js too.
 * `strict` demands the notation be unambiguous: if two legal moves answer to the
 * same string the record is thrown away rather than shipped with a coin flip.
 */
function resolveNotation(game, notation, plugin, dims) {
  const legal = game.getLegalMoves()
  const rows = dims?.rows
  const cols = dims?.cols
  // findLegalMove falls back to the chess SAN writer when a string is not UCI,
  // and that writer throws on a reversi/go placement move, so it is only asked
  // about strings it can actually parse. Hex notation (contains '-') also routes
  // through findLegalMove via its findHexMove path.
  // findLegalMove reads every notation a record may carry - UCI, a bare square
  // for a placement, hex cells, a written move - so it is asked first. Its SAN
  // fallback throws on a family with no pieces to name, which is a no.
  let viaEngine = null
  try { viaEngine = findLegalMove(game, notation) } catch { viaEngine = null }
  if (viaEngine) {
    const matches = legal.filter(m => {
      const written = moveToNotation(m, rows, cols, plugin, legal)
      return written && written.text === notation
    })
    return { move: viaEngine, ambiguous: matches.length !== 1, resolver: 'findLegalMove' }
  }
  // Placement families and hex: the engine has no UCI for these.
  const matches = legal.filter(m => {
    const written = moveToNotation(m, rows, cols, plugin, legal)
    return written && written.text === notation
  })
  if (matches.length === 0) return null
  return { move: matches[0], ambiguous: matches.length !== 1, resolver: 'square' }
}

// ── turn enumeration ────────────────────────────────────────────────────────

let ALLOW_PLACEMENT = false

const MAX_TURN_PLIES = 12      // draughts chains and progressive lines are bounded
const MAX_TURNS = 2000         // a position with more turns than this is skipped

/**
 * Replay a path of move indices from `fen` and report where it lands.
 * Backtracking is done by replay rather than by undo() or by cloning state,
 * because replay is the only method that is definitionally identical to what a
 * consumer does with the record.
 *
 * `nameable` is false when some move on the path cannot be written down so that
 * it alone answers to the string — a shogi promotion that shares from/to with
 * its non-promoting twin, say. Such a turn still counts: it is a real
 * alternative the solver must reject, and the uniqueness proof needs it. It just
 * cannot be the recorded solution.
 */
function replayPath(game, fen, path, plugin, dims) {
  loadPosition(game, fen)
  const notation = []
  const signatures = []
  const moves = []
  let nameable = true
  let result = null
  for (const index of path) {
    const legal = game.getLegalMoves()
    const move = legal[index]
    if (!move) return null
    signatures.push(moveSignature(move))
    moves.push(move)
    const written = moveToNotation(move, dims?.rows, dims?.cols, plugin, legal)
    if (!written) {
      nameable = false
      notation.push(null)
    } else {
      if (written.needsUniqueFromTo || written.placement) {
        const twins = legal.filter(m => {
          const w = moveToNotation(m, dims?.rows, dims?.cols, plugin, legal)
          return w && w.text === written.text
        })
        if (twins.length !== 1) nameable = false
      }
      notation.push(written.text)
    }
    result = game.applyMove(move)
    if (!result || result.ok === false) return null
  }
  return { notation, signatures, moves, nameable, result }
}

/**
 * Every turn available to the side to move in `fen`, as
 * { notation, signatures, nameable, winner, opponentMoves }. A turn runs until
 * the engine stops saying continueTurn, so a draughts triple jump is one turn
 * with three entries and a chess move is one turn with one.
 * Returns null when the position has more turns than MAX_TURNS or when the
 * engine refuses one of its own moves.
 */
export function enumerateTurns(game, fen, mover, plugin, dims, objective = null) {
  loadPosition(game, fen)
  const before = objective?.measure ? structuredClone(game.getState().slice) : null
  const rootCount = game.getLegalMoves().length
  const turns = []
  const queue = []
  for (let i = 0; i < rootCount; i++) queue.push([i])

  while (queue.length) {
    if (turns.length > MAX_TURNS) return null
    const path = queue.shift()
    const played = replayPath(game, fen, path, plugin, dims)
    if (!played) return null
    const { notation, signatures, moves, nameable, result } = played
    const stillOurs = result.winner === null
      && result.continueTurn
      && game.getState().players.currentIndex === mover
    if (stillOurs && path.length < MAX_TURN_PLIES) {
      const next = game.getLegalMoves().length
      if (next > 0) {
        for (let i = 0; i < next; i++) queue.push([...path, i])
        continue
      }
    }
    turns.push({
      path,
      notation,
      signatures,
      moves,
      nameable,
      winner: result.winner,
      opponentMoves: result.winner === null ? game.getLegalMoves().length : 0,
      // What the turn is worth by the game's own puzzle measure, where the
      // family declares one.
      value: objective?.measure ? objective.measure(before, game.getState().slice, mover) : null,
    })
  }
  return turns
}

// ── puzzle shapes ───────────────────────────────────────────────────────────
//
// What makes a position a puzzle, per shape. The search and the verifier both
// ask these, so a record is re-derived by the same judgement that found it.
//
//   win    exactly one turn wins at once (the original shape)
//   best   exactly one move does best by the family's own measure, where
//          winning at once is not the natural question: stones captured, seeds
//          banked, a mill formed, discs turned (the plugin's `puzzleObjective`)
//   win2   exactly one turn forces a win on the next: every reply leaves a
//          winning turn. No win at once exists, so the depth is real.

// Winning moves that differ only in what the family does not count as the
// decision - which man a morris mill would remove, when the mill wins outright
// - are one answer, as `bestShape` counts them.
function winShape(turns, mover, objective = null) {
  const decisionOf = t => moveSignature(objective?.decision ? objective.decision(t.moves[0]) : t.moves[0])
  const winning = turns.filter(t => t.winner === mover)
  const decisions = new Set(winning.map(decisionOf))
  if (decisions.size !== 1) return { reason: decisions.size > 1 ? 'multiWin' : null }
  const turn = winning[0]
  const line = objective?.decision && winning.length > 1
    ? [{ ...turn, notation: [writeMove(objective.decision(turn.moves[0]))], decisionOnly: true }]
    : [turn]
  return { line, distractors: new Set(turns.map(decisionOf)).size - 1 }
}

export function bestShape(turns, mover, objective) {
  if (!objective || turns.some(t => t.winner !== null && t.winner !== undefined)) return {}
  const byDecision = new Map()
  for (const turn of turns) {
    const decision = objective.decision ? objective.decision(turn.moves[0]) : turn.moves[0]
    const key = moveSignature(decision)
    const entry = byDecision.get(key) || { decision, value: -Infinity, turn: null }
    if (turn.value > entry.value) { entry.value = turn.value; entry.turn = turn }
    byDecision.set(key, entry)
  }
  const ranked = [...byDecision.values()].sort((a, b) => b.value - a.value)
  if (ranked.length < 2 || !(ranked[0].value > 0) || ranked[1].value >= ranked[0].value) return {}
  // The answer is the decision; any part of the move the measure does not tell
  // apart (which man a mill removes) is left to the solver.
  return {
    // The whole move is the decision unless the family says otherwise, and
    // then the turn's own notation - a Go stone's square - says it.
    line: [objective.decision
      ? { ...ranked[0].turn, notation: [writeMove(ranked[0].decision)], decisionOnly: true }
      : { ...ranked[0].turn, notation: [ranked[0].turn.notation[0]] }],
    distractors: ranked.length - 1,
    value: ranked[0].value,
    margin: ranked[0].value - ranked[1].value,
  }
}

// The exact chance the mover wins from here, weighing each roll by the plugin's
// own `chanceOutcomes`. Only positions where nobody else has a choice to make
// are measured - every other seat can only pass - so the answer is the mover's
// alone. Returns null if the game is not certain to end within `horizon` of the
// mover's turns, or another seat has a choice.
function winChance(game, position, mover, plugin, horizon, memo) {
  const key = `${horizon}|${positionKey(position)}`
  if (memo.has(key)) return memo.get(key)
  loadPosition(game, position)
  const state = game.getState()
  const seat = state.players.currentIndex
  const legal = game.getLegalMoves()
  let value
  if (seat !== mover && legal.length !== 1) value = null
  else if (seat === mover && horizon === 0) value = null
  else {
    const scores = []
    for (const move of legal) {
      const outcomes = plugin.chanceOutcomes?.(move, state.slice) || [{ move, probability: 1 }]
      let expected = 0
      for (const { move: outcome, probability } of outcomes) {
        loadPosition(game, position)
        const result = game.applyMove(outcome)
        let v
        if (result.winner !== null && result.winner !== undefined) v = result.winner === mover ? 1 : result.winner === 'draw' ? 0.5 : 0
        else v = winChance(game, snapshot(game), mover, plugin, seat === mover ? horizon - 1 : horizon, memo)
        if (v === null) { expected = null; break }
        expected += probability * v
      }
      if (expected === null) { scores.push(null); break }
      scores.push({ move, chance: expected })
    }
    value = scores.includes(null) ? null
      : seat === mover ? Math.max(...scores.map(s => s.chance)) : scores[0].chance
  }
  memo.set(key, value)
  return value
}

// Odds: the one choice whose chance of winning is the best, by a clear margin.
export function oddsShape(scratch, position, turns, mover, plugin, { horizon = 8, margin = 0.05 } = {}) {
  if (turns.length < 2) return {}
  const memo = new Map()
  const rated = []
  for (const turn of turns) {
    const outcomes = plugin.chanceOutcomes?.(turn.moves[0]) || null
    loadPosition(scratch, position)
    const state = scratch.getState()
    let chance = 0
    for (const { move, probability } of outcomes || [{ move: turn.moves[0], probability: 1 }]) {
      loadPosition(scratch, position)
      const result = scratch.applyMove(move)
      const v = result.winner !== null && result.winner !== undefined
        ? (result.winner === mover ? 1 : 0)
        : winChance(scratch, snapshot(scratch), mover, plugin, horizon - 1, memo)
      if (v === null) return {}
      chance += probability * v
    }
    if (state.players.currentIndex !== mover) return {}
    rated.push({ turn, chance })
  }
  rated.sort((a, b) => b.chance - a.chance)
  if (rated[0].chance - rated[1].chance < margin) return {}
  return {
    line: [rated[0].turn],
    distractors: rated.length - 1,
    value: Math.round(rated[0].chance * 10000) / 10000,
    margin: Math.round((rated[0].chance - rated[1].chance) * 10000) / 10000,
  }
}

function positionAfter(game, position, path, plugin, dims) {
  const played = replayPath(game, position, path, plugin, dims)
  if (!played) return null
  return { position: snapshot(game), played, next: game.getState().players.currentIndex }
}

// A reply the defender can make that leaves the attacker no win at once
// refutes the move; a move every reply to which loses is forcing.
export function win2Shape(scratch, position, turns, mover, plugin, dims) {
  if (turns.some(t => t.winner === mover)) return {}
  const forcing = []
  for (const first of turns) {
    if (first.winner !== null && first.winner !== undefined) continue
    const after = positionAfter(scratch, position, first.path, plugin, dims)
    if (!after || after.next === mover) continue
    const replies = enumerateTurns(scratch, after.position, after.next, plugin, dims)
    if (!replies || !replies.length) continue
    let line = null
    let refuted = false
    for (const reply of replies) {
      if (reply.winner !== null && reply.winner !== undefined) { refuted = true; break }
      const next = positionAfter(scratch, after.position, reply.path, plugin, dims)
      if (!next || next.next !== mover) { refuted = true; break }
      const mine = enumerateTurns(scratch, next.position, mover, plugin, dims)
      const wins = (mine || []).filter(t => t.winner === mover)
      if (!wins.length) { refuted = true; break }
      // The main line is the reply that leaves the fewest winning answers, so
      // the recorded finish is as unique as the position allows.
      const named = wins.filter(t => t.nameable)
      if (reply.nameable && named.length && (!line || wins.length < line.wins)) line = { reply, win: named[0], wins: wins.length }
    }
    if (refuted) continue
    forcing.push({ first, line })
    if (forcing.length > 1) return { reason: 'multiWin2' }
  }
  if (forcing.length !== 1 || !forcing[0].line || !forcing[0].first.nameable) return {}
  const { first, line } = forcing[0]
  return { line: [first, line.reply, line.win], distractors: turns.length - 1 }
}

// ── position fidelity ───────────────────────────────────────────────────────

function moveSignature(move) {
  const keys = Object.keys(move).sort()
  return keys.map(k => `${k}=${JSON.stringify(move[k])}`).join(',')
}

/**
 * Does this FEN actually describe the position that was reached?
 * `live` is the game played forward; `probe` is a fresh game loaded from the
 * FEN. If their legal move sets differ, state the FEN cannot carry (shogi hands,
 * go ko, crazyhouse pockets) is load-bearing here, and the record would describe
 * a different position than the one that was searched. Reject rather than guess.
 */
function fenIsFaithful(live, probe, fen) {
  try {
    loadPosition(probe, fen)
  } catch {
    return false
  }
  if (toFen(probe) !== fen) return false
  if (probe.getState().players.currentIndex !== live.getState().players.currentIndex) return false
  const a = live.getLegalMoves().map(moveSignature).sort()
  const b = probe.getLegalMoves().map(moveSignature).sort()
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// ── record building ─────────────────────────────────────────────────────────

function camelCase(slug) {
  return slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
}

/**
 * Rating is derived, not invented. Two things about the position are known
 * exactly and are the only honest inputs available without an evaluator:
 *   - `distractors`: how many other turns the solver has to reject. A win-in-1
 *     among 40 candidates is harder to spot than one among 5.
 *   - `depth`: how many moves the winning turn takes (>1 only for capture
 *     chains and continue-turn variants), which adds a step of look-ahead.
 * 800 is the floor the shipped pool uses for its easiest records; the scale is
 * 25 rating points per distractor and 150 per extra move, capped at 2500.
 */
function ratingFor(distractors, depth) {
  return Math.max(800, Math.min(2500, 800 + 25 * distractors + 150 * (depth - 1)))
}

// A UCI move is <file><rank><file><rank>[<promotion>]; ranks may be two digits,
// so the trailing single letter is the only unambiguous marker of a promotion,
// and a length test gets it wrong on 10-rank boards ("a9a10q" is 6 characters).
const PROMOTION_SUFFIX = /^[a-z]\d+[a-z]\d+([a-z])$/

// Themes read off the position and the line, not off the family's name. The
// generator used to call every chess, shogi and xiangqi win "mate" and every
// draughts win "elimination"; a king taken on a board with no check, or a
// draughts win by blockade, was mislabelled.
function occupiedBy(slice, seat) {
  const cells = Array.isArray(slice.board) ? slice.board : Object.values(slice.board || {})
  return cells.filter(c => c !== null && c !== undefined && (typeof c === 'object' ? c.owner === seat : c === seat)).length
}

function isCapture(move, slice) {
  if (move.captured !== undefined && move.captured !== null) return true
  if (move.capture || (Array.isArray(move.captures) && move.captures.length) || (Array.isArray(move.flips) && move.flips.length)) return true
  const target = move.to !== undefined ? slice.board?.[move.to] : undefined
  return !!(target && typeof target === 'object' && target.owner !== undefined)
}

// `isInCheck` takes a board, as every plugin that has one declares it.
export function themesFor({ game, position, line, mover, shape, objective }) {
  const plugin = pluginOf(game)
  const loser = 1 - mover
  const themes = []
  if (shape === 'best' || shape === 'odds') themes.push(objective.theme)
  else themes.push(shape === 'win2' ? 'winIn2' : 'winIn1')

  // Walk the line from the position, looking at each of the mover's moves.
  loadPosition(game, position)
  let result = null
  let firstGivesCheck = false
  let firstCaptures = false
  line.forEach((turn, index) => {
    for (const move of turn.moves) {
      const before = game.getState().slice
      if (index === 0 && isCapture(move, before)) firstCaptures = true
      if (move.promotion) themes.push('promotion')
      result = game.applyMove(move)
    }
    if (index === 0 && typeof plugin.isInCheck === 'function') firstGivesCheck = !!plugin.isInCheck(game.getState().slice.board, loser)
  })
  if (line[0].moves.length > 1) themes.push('chain')
  if (shape !== 'best' && shape !== 'odds' && result && result.winner === mover) {
    const end = game.getState().slice
    if (typeof plugin.isInCheck === 'function' && plugin.isInCheck(end.board, loser)) themes.push('mate', shape === 'win2' ? 'mateIn2' : 'mateIn1')
    else if (occupiedBy(end, loser) === 0) themes.push('elimination')
    else if (game.getLegalMoves().length === 0) themes.push('blockade')
  }
  if (firstGivesCheck && shape === 'win2') themes.push('check')
  if (firstCaptures) themes.push('capture')

  // A sacrifice: the forcing move takes nothing and leaves the moved piece
  // where the defender can take it.
  if (shape === 'win2' && !firstCaptures) {
    loadPosition(game, position)
    const first = line[0].moves[line[0].moves.length - 1]
    for (const move of line[0].moves) game.applyMove(move)
    const offered = game.getLegalMoves().some(reply => reply.to === first.to && isCapture(reply, game.getState().slice))
    if (offered) themes.push('sacrifice')
    else if (!firstGivesCheck) themes.push('quietMove')
  }
  return [...new Set(themes)]
}

export function buildRecord({ family, entry, hit, index, game, dims, playerNames, objective }) {
  const { position, line, shape, distractors } = hit
  const state = typeof position === 'string' ? null : position
  // `turn` is the label the shipped schema wants: it must agree with the FEN's
  // own w/b letter, and fen.js writes 'w' for player 0 in every family. In
  // families where player 0 is not called white — reversi and go start with
  // black, shogi with sente, xiangqi with red — that label is a lie by
  // convention, so the record also carries the mover the engine actually means.
  const moverIndex = state ? state.players.currentIndex : (position.trim().split(/\s+/)[1] === 'b' ? 1 : 0)
  // Seat 0 is "white" and every other seat "black", the one rule the verifier,
  // the normaliser and the test all read; `moverIndex` is the truth.
  const turnField = moverIndex === 0 ? 'white' : 'black'
  const solution = line.flatMap(t => t.notation)
  const depth = shape === 'win2' ? 2 : line[0].notation.length
  const variant = camelCase(entry.key)
  const label = entry.label || variant
  const puzzleType = shape === 'best' || shape === 'odds' ? `${label}: ${objective.label}` : shape === 'win2' ? `${label} win in 2` : `${label} win in 1`
  const record = {
    // Chess keeps the shipped pool's `<variant>_<n>` shape; other families are
    // prefixed so a merged corpus cannot collide on ids like "standard_gen_1",
    // which chess, xiangqi and shogi would all otherwise claim.
    id: `${family === 'chess' ? '' : `${family}_`}${variant}_${shape === 'win' ? 'gen' : shape}_${index}`,
    family,
    variant,
    variantSlug: entry.key,
  }
  if (state) {
    // A position a FEN cannot carry is the engine's snapshot, with the board
    // written in the setup notation the renderer draws.
    record.state = state
    const topology = { ...(game.raw?.definition?.topology || {}), pitsPerSide: game.topology?.pitsPerSide }
    record.position = boardToSetup(state.slice, topology, pluginOf(game).vocabulary || {})
  } else {
    record.fen = position
    record.position = position
  }
  Object.assign(record, {
    turn: turnField,
    moverIndex,
    moverName: (playerNames || [])[moverIndex] || turnField,
    shape,
    solution,
    depth,
    distractors,
    rating: ratingFor(distractors, depth),
    themes: themesFor({ game, position, line, mover: moverIndex, shape, objective }),
    puzzleType,
    source: 'engine-generated',
    generator: 'scripts/generate-puzzles.mjs',
    notation: solution[0].startsWith('{') ? 'move' : dims && solution[0].length >= 4 ? 'uci' : 'square',
  })
  // The measure the answer won by: seeds, stones or discs for `best`, and for
  // `odds` the exact chance of winning it gives.
  if (shape === 'best' || shape === 'odds') record.value = hit.value
  return record
}

// ── verification ────────────────────────────────────────────────────────────

/**
 * Prove a record from the record. Nothing from the search survives into here
 * except the strings that were written down: a fresh game is built, the record's
 * own `position` is loaded, and every claim it makes is re-derived.
 * Returns { ok: true } or { ok: false, reason }.
 */
export function verifyRecord(record, { repair = false } = {}) {
  let game
  try {
    game = freshGame(record.family, record.variantSlug)
  } catch (error) {
    return { ok: false, reason: `variant will not instantiate: ${error.message}` }
  }
  const plugin = pluginOf(game)
  const dims = dimsOf(game)
  const position = record.state || record.position
  const shape = record.shape || 'win'
  const objective = getPlugin(record.family)?.factory?.puzzleObjective || null

  if (!record.state) {
    // (a) every FEN symbol is declared by this variant — the check the shipped
    //     corpus fails 196 times.
    const declared = vocabularySymbols(plugin)
    const boardPart = record.position.trim().split(/\s+/)[0]
    for (const token of boardPart.split('/').join('').match(/\+?[A-Za-z]/g) || []) {
      if (!declared.has(token)) return { ok: false, reason: `FEN symbol "${token}" is not in the ${record.variantSlug} vocabulary` }
    }
  }

  // (b) any promotion suffix names a piece this variant actually promotes to —
  //     the check that catches "=c" and "=a" in the shipped corpus.
  const promotable = promotableSymbols(plugin)
  for (const move of record.solution) {
    const suffix = PROMOTION_SUFFIX.exec(move)
    if (!suffix) continue
    if (!promotable.has(suffix[1])) {
      return { ok: false, reason: `promotion to "${suffix[1]}" but ${record.variantSlug} promotes only to ${[...promotable].join('/') || '(nothing)'}` }
    }
  }

  // (c) the position loads and says what the record says it says.
  try {
    loadPosition(game, position)
  } catch (error) {
    return { ok: false, reason: `position will not load: ${error.message}` }
  }
  if (!record.state && toFen(game) !== record.position) return { ok: false, reason: 'position does not round-trip' }
  const mover = game.getState().players.currentIndex
  const expected = mover === 0 ? 'white' : 'black'
  if (record.turn !== expected) return { ok: false, reason: `turn says ${record.turn}, position says ${expected}` }
  if (record.moverIndex !== mover) return { ok: false, reason: `moverIndex says ${record.moverIndex}, position says ${mover}` }
  const seat = game.raw.playerSystem.getAll()[mover]
  if (seat && record.moverName !== seat) return { ok: false, reason: `moverName says ${record.moverName}, engine seat is ${seat}` }

  // (d) the recorded solution resolves, unambiguously, and plays. It is
  //     resolved by `findLegalMove`, the resolver this repo's puzzle test
  //     uses, so a record it cannot resolve is one that test cannot check.
  let result = null
  for (const notation of record.solution) {
    const resolved = resolveNotation(game, notation, plugin, dims)
    if (!resolved) return { ok: false, reason: `"${notation}" is not legal in position` }
    if (resolved.ambiguous && !notation.startsWith('{')) return { ok: false, reason: `"${notation}" names more than one legal move` }
    if (resolved.resolver !== 'findLegalMove' && !ALLOW_PLACEMENT) {
      return { ok: false, reason: `"${notation}" is a placement move, which fen.js#findLegalMove cannot resolve (pass --allow-placement to emit it anyway)` }
    }
    result = game.applyMove(resolved.move)
    if (!result || result.ok === false) return { ok: false, reason: `engine rejected "${notation}"` }
  }
  if (shape !== 'best' && shape !== 'odds' && result.winner !== mover) {
    return { ok: false, reason: `solution does not win: engine reports winner=${JSON.stringify(result.winner)}, mover=${mover}` }
  }

  // (e) the shape holds on re-enumeration: the property that makes it a puzzle
  //     rather than a position with a decent move in it.
  const scratch = freshGame(record.family, record.variantSlug)
  const turns = enumerateTurns(scratch, position, mover, pluginOf(scratch), dimsOf(scratch), objective)
  if (!turns) return { ok: false, reason: 'position could not be re-enumerated' }
  const again = shape === 'best' ? bestShape(turns, mover, objective)
    : shape === 'win2' ? win2Shape(scratch, position, turns, mover, pluginOf(scratch), dimsOf(scratch))
    : shape === 'odds' ? oddsShape(scratch, position, turns, mover, pluginOf(scratch))
    : winShape(turns, mover, objective)
  if (!again.line) return { ok: false, reason: `re-enumeration does not find a ${shape} puzzle here` }
  const firstAgain = again.line[0].notation.join(' ')
  const firstRecorded = record.solution.slice(0, again.line[0].notation.length).join(' ')
  if (firstAgain !== firstRecorded) return { ok: false, reason: `re-enumeration found a different answer: ${firstAgain}` }
  if (again.distractors !== record.distractors) {
    // The answer stands and only the count of alternatives has moved - a rule
    // added to the variant since offers moves it did not. With `repair` the
    // count, and the rating derived from it, are corrected rather than the
    // puzzle thrown away.
    if (!repair) return { ok: false, reason: 'distractor count disagrees with re-enumeration' }
    return { ok: true, repaired: { distractors: again.distractors, rating: ratingFor(again.distractors, record.depth || 1) } }
  }

  return { ok: true }
}

// ── search ──────────────────────────────────────────────────────────────────

/**
 * Play the variant forward and stop wherever exactly one turn wins.
 *
 * Move choice is seeded (packages/core/src/rng.js; the repo forbids ambient
 * Math.random in plugins and this script keeps to the same rule) and biased
 * towards sharpness: most of the time it plays the turn that leaves the opponent
 * with the fewest replies, which walks both sides into mating nets and
 * zugzwang far faster than uniform random play, with a random tail so repeated
 * seeds do not retrace one line.
 */
function searchVariant(family, entry, opts, stats) {
  const found = []
  let live, probe, scratch
  try {
    live = freshGame(family, entry.key, { rngSeed: opts.seed })
    probe = freshGame(family, entry.key, { rngSeed: opts.seed })
    scratch = freshGame(family, entry.key, { rngSeed: opts.seed })
  } catch (error) {
    stats.skipped.push({ variant: entry.key, reason: `will not instantiate: ${error.message}` })
    return found
  }
  const dims = dimsOf(live)
  const plugin = pluginOf(live)

  const objective = getPlugin(family)?.factory?.puzzleObjective || null
  // Unless a shape is asked for: the move that wins, where a position has one,
  // and otherwise the family's own measure. Capture Go and Gomoku are won by an
  // event, and there the winning move is the puzzle.
  const shape = opts.shape || 'auto'

  const rng = createRng(opts.seed)
  const seen = new Set()
  // Random play on a wide board never builds the shapes a puzzle needs - five
  // stones in a line on Gomoku's 15x15 - so the playout can instead ask the
  // family's own AI, at its weakest and seeded, for most of its moves.
  const ai = opts.policy === 'ai'
    ? createAI(family, entry.key, { difficulty: 'beginner', rngSeed: opts.seed, searchOpts: { deterministic: true, random: () => rng.next() } })
    : null
  let scanned = 0
  let playouts = 0

  // A variant whose positions never survive the round trip (go writes "black"
  // into the board field, which is not a symbol anything can parse back) would
  // otherwise spin here forever: nothing is ever scanned, so the budget never
  // moves. Give it a fair number of tries from different seeds, then say so.
  const BARREN_PLAYOUTS = 60
  let barren = 0
  let runner = null

  while (scanned < opts.positions && found.length < opts.count) {
    if (barren >= BARREN_PLAYOUTS) {
      // Two different dead ends, and they deserve different words. Nothing ever
      // scanned means the variant's positions do not survive serialisation at
      // all (go). Nothing NEW scanned means the searchable part of the state
      // space — for shogi, the capture-free part — has run out.
      stats.skipped.push({
        variant: entry.key,
        reason: scanned === 0
          ? `no position survived the FEN round trip in ${barren} playouts — this variant keeps state the board field cannot carry`
          : `exhausted: ${barren} consecutive playouts found no position not already searched (stopped at ${scanned} of ${opts.positions})`,
      })
      break
    }
    const scannedBefore = scanned
    playouts++
    // A new game every 64 playouts so variants that roll dice or shuffle their
    // setup at init still see fresh randomness; in between, reuse and reset.
    let game
    if (!runner || playouts % 64 === 0) {
      try {
        runner = freshGame(family, entry.key, { rngSeed: opts.seed + playouts })
      } catch {
        break
      }
      game = runner
    } else {
      game = resetGame(runner)
    }
    // Each playout opens with a few purely random plies so repeated runs of the
    // biased policy do not retrace one line and hand back near-identical records.
    const randomOpening = 2 + (playouts % 7)

    for (let ply = 0; ply < opts.maxPlies && scanned < opts.positions && found.length < opts.count; ply++) {
      const mover = game.getState().players.currentIndex
      if (game.getLegalMoves().length === 0) break

      // The position as a FEN where the family's FEN carries it exactly, and as
      // the engine's own snapshot where it does not.
      let fen = null
      try { fen = toFen(game) } catch { fen = null }
      const position = fen && fenIsFaithful(game, probe, fen) ? fen : snapshot(game)
      if (typeof position !== 'string') stats.snapshots++

      let turns = null
      const key = positionKey(position)
      if (!seen.has(key)) {
        seen.add(key)
        if (ply >= opts.minPly) {
          scanned++
          turns = enumerateTurns(scratch, position, mover, plugin, dims, objective)
          if (turns) {
            let found1 = null
            let used = shape
            if (shape === 'win2') found1 = win2Shape(scratch, position, turns, mover, plugin, dims)
            else if (shape === 'best') found1 = bestShape(turns, mover, objective)
            else if (shape === 'odds' || (shape === 'auto' && objective?.shape === 'odds')) {
              found1 = oddsShape(scratch, position, turns, mover, plugin)
              used = 'odds'
            }
            else {
              found1 = winShape(turns, mover, objective)
              used = 'win'
              if (!found1.line && shape === 'auto' && objective && !found1.reason) {
                found1 = bestShape(turns, mover, objective)
                used = 'best'
              }
            }
            const puzzle = found1
            if (puzzle.reason) stats[puzzle.reason] = (stats[puzzle.reason] || 0) + 1
            if (puzzle.line) {
              // A choice under chance between two options - roll or buy - is
              // the whole question, so one alternative is enough there.
              const minimum = used === 'odds' ? 1 : opts.minDistractors
              if (puzzle.distractors < minimum) stats.forced++
              else if (puzzle.line.some(t => !t.nameable)) stats.unnameable++
              else {
                found.push({ position, turns, ...puzzle, shape: used })
                break   // this position is a puzzle; start a fresh playout
              }
            }
          } else {
            stats.unrepresentable++
          }
        }
      }

      // Advance. Sharpness bias: most of the time play the turn that leaves the
      // opponent with the fewest replies, which walks both sides into mating
      // nets and zugzwang far faster than uniform random play. When the position
      // was enumerated above this is free — the mobility numbers are already in
      // hand. Turns that end the game are never chosen; the playout would stop.
      const legal = game.getLegalMoves()
      if (!legal.length) break
      let choice = null
      const biased = ply >= randomOpening && rng.next() < 0.7
      if (biased && turns) {
        const live = turns.filter(t => t.winner === null)
        if (live.length) {
          // Ties break at random. Sorted stably, equal turns kept board order,
          // and on a board where every move leaves the same number of replies -
          // Gomoku's - the playout filled the board from its first corner, one
          // colour after the other along a row, and five in a line never formed.
          const keyed = live.map(turn => ({ turn, tie: rng.next() }))
          keyed.sort((a, b) => a.turn.opponentMoves - b.turn.opponentMoves || a.tie - b.tie)
          const ranked = keyed.map(k => k.turn)
          const pick = ranked[rng.nextInt(0, Math.min(2, ranked.length - 1))]
          choice = legal.find(m => moveSignature(m) === pick.signatures[0]) || null
        }
      }
      if (!choice && ai && ply >= randomOpening && rng.next() < 0.8) {
        const state = game.getState()
        const picked = ai.pickMove(structuredClone(state.slice), state.players.currentIndex)
        choice = picked ? legal.find(m => moveSignature(m) === moveSignature(picked)) || null : null
      }
      if (!choice) {
        const captures = legal.filter(m => m.capture || m.captured !== undefined || m.flips)
        const pool = captures.length && biased ? captures : legal
        choice = pool[rng.nextInt(0, pool.length - 1)]
      }
      const result = game.applyMove(choice)
      if (!result || result.ok === false) break
      if (result.winner !== null && result.winner !== undefined) break
    }
    barren = scanned === scannedBefore ? barren + 1 : 0
  }

  stats.perVariant.push({ variant: entry.key, scanned, playouts, found: found.length })
  return found
}

// ── main ────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2))
  ALLOW_PLACEMENT = opts.allowPlacement
  const started = Date.now()

  const families = opts.family.split(',').map(f => f.trim()).filter(Boolean)
  const stats = {
    perVariant: [], skipped: [], rejected: [],
    multiWin: 0, unrepresentable: 0, infidelity: 0, unnameable: 0, forced: 0, snapshots: 0,
  }

  const puzzles = []
  for (const family of families) {
    let entries
    try {
      entries = listVariants(family)
    } catch (error) {
      stats.skipped.push({ variant: `${family}/*`, reason: `no variants: ${error.message}` })
      continue
    }
    const wanted = opts.all
      ? entries
      : entries.filter(e => e.key === opts.variant || e.slug === opts.variant)
    if (!wanted.length) {
      throw new Error(`No variant "${opts.variant}" in family "${family}". Try --all, or one of: ${entries.slice(0, 8).map(e => e.key).join(', ')}…`)
    }

    for (const entry of wanted) {
      const hits = searchVariant(family, entry, opts, stats)
      let index = 0
      for (const hit of hits) {
        let game
        try {
          game = freshGame(family, entry.key)
        } catch { continue }
        const record = buildRecord({
          family, entry, hit, index: ++index, game, dims: dimsOf(game),
          playerNames: game.raw.playerSystem.getAll(),
          objective: getPlugin(family)?.factory?.puzzleObjective || null,
        })
        const verdict = verifyRecord(record)
        if (verdict.ok) puzzles.push(record)
        else {
          index--
          stats.rejected.push({ id: record.id, reason: verdict.reason })
        }
      }
    }
  }

  const elapsed = (Date.now() - started) / 1000
  const output = {
    meta: {
      generated: new Date().toISOString().slice(0, 10),
      generator: 'scripts/generate-puzzles.mjs',
      shape: `${opts.shape || 'family default'}, verified by exhaustive replay through the variant plugin`,
      families,
      seed: opts.seed,
      count: puzzles.length,
      runtimeSeconds: Number(elapsed.toFixed(2)),
    },
    puzzles,
  }

  const json = JSON.stringify(output, null, 2)
  if (opts.out) writeFileSync(opts.out, json + '\n')
  else process.stdout.write(json + '\n')

  if (!opts.quiet) {
    const lines = ['', `=== generate-puzzles: ${puzzles.length} verified record(s) in ${elapsed.toFixed(1)}s ===`]
    for (const row of stats.perVariant) {
      const yield1k = row.scanned ? ((row.found / row.scanned) * 1000).toFixed(1) : '0.0'
      lines.push(`  ${row.variant}: ${row.found} found / ${row.scanned} positions scanned (${yield1k} per 1000), ${row.playouts} playouts`)
    }
    if (stats.skipped.length) {
      lines.push(`  skipped variants (${stats.skipped.length}):`)
      for (const s of stats.skipped) lines.push(`    ${s.variant}: ${s.reason}`)
    }
    if (stats.rejected.length) {
      lines.push(`  rejected at verification (${stats.rejected.length}):`)
      for (const r of stats.rejected) lines.push(`    ${r.id}: ${r.reason}`)
    }
    lines.push(`  positions with >1 winning turn (not puzzles): ${stats.multiWin}`)
    lines.push(`  win-in-1s dropped for having fewer than ${opts.minDistractors} distractors: ${stats.forced}`)
    lines.push(`  positions dropped for FEN infidelity: ${stats.infidelity}`)
    lines.push(`  positions with unrepresentable moves: ${stats.unrepresentable}`)
    lines.push(`  win-in-1s dropped because the move cannot be named unambiguously: ${stats.unnameable}`)
    process.stderr.write(lines.join('\n') + '\n')
  }
}

// Importable for tests; only runs the CLI when invoked directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
