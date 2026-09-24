#!/usr/bin/env node
/**
 * Measures every puzzle against the engine's own AI (engine#178 C1).
 *
 * A puzzle's rating was asserted: 25 points per distractor for generated
 * records, whatever the source said for the rest. This asks the engine. Each
 * difficulty of each search is given the position, and the record keeps which
 * of them found the solution's first move:
 *
 *   ai.minimax.solves   the levels that found it, weakest first
 *   ai.minimax.nodes    what the weakest of them searched to find it
 *   ai.mcts.solves      the same for Monte Carlo search, where it was run
 *   ai.disagree         the strongest minimax and MCTS chose different moves
 *   difficulty          the weakest minimax level that solves it, or 'unsolved'
 *
 * Every search is deterministic - a node or iteration budget in place of a
 * clock, and a random source seeded from the record's id - so the numbers are
 * the same on any machine, and a regression test can hold the AI to them: a
 * change that stops a level solving what it solved is a bug.
 *
 * `meta.unsolvedByEngine` lists the puzzles no level of either search solves:
 * the positions that beat this engine.
 *
 * MCTS is run at its strongest level only, for the disagreement: a chess
 * rollout plays to depth 100 at random, and five levels of it over the corpus
 * is a day's computing for a question one level answers.
 *
 * Usage:
 *   node scripts/rate-puzzles.mjs [--limit=N] [--family=chess] [--ids=a,b] [--mcts=all|variants|none] [--dry]
 *   node scripts/rate-puzzles.mjs --shard=0/8 --out=tmp/0.json    # one slice, results only
 *   node scripts/rate-puzzles.mjs --merge=tmp                      # apply every slice in a directory
 *   node scripts/rate-puzzles.mjs --unrated                        # only records not yet rated
 */

import '../packages/play/test-helpers/setup-rules-reader.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createGameForVariant, loadPuzzle, findLegalMove } from '../packages/play/src/fen.js'
import { createAI } from '../packages/play/src/sdk.js'
import { createRng } from '../packages/core/src/rng.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUZZLE_FILE = path.join(ROOT, 'api', 'puzzles', 'index.json')

export const LEVELS = ['beginner', 'easy', 'medium', 'hard', 'expert']

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v === undefined ? true : v]
}))

// A number from a record's id, so each record is searched with its own seed
// and the same seed every run.
export function seedOf(id) {
  let h = 2166136261
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

// The fields that make two moves the same move. The solution is read by the
// engine's own findLegalMove, so both sides are engine move objects.
const MOVE_FIELDS = ['from', 'to', 'promotion', 'action', 'type', 'coord', 'castle', 'promote', 'gate', 'gateAt']
export function sameMove(a, b) {
  if (!a || !b) return false
  return MOVE_FIELDS.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]))
}

// One AI per variant, search and level, reused across that variant's records.
// Its random source is swapped per record, and its memory cleared, so no record
// is searched differently for coming after another.
const ais = new Map()
function aiFor(family, slug, search, level) {
  const key = `${family}/${slug}/${search}/${level}`
  if (!ais.has(key)) {
    const holder = { rng: createRng(1) }
    const ai = createAI(family, slug, {
      difficulty: level,
      search,
      rngSeed: 1,
      searchOpts: { deterministic: true, random: () => holder.rng.next() },
    })
    ais.set(key, { ai, holder })
  }
  return ais.get(key)
}

// What each level of one search does with a position.
export function measure(record, search, levels = LEVELS) {
  const family = record.family || 'chess'
  const slug = record.variantSlug || 'standard'
  const game = createGameForVariant(family, slug)
  loadPuzzle(game, record)
  const expected = findLegalMove(game, record.solution[0])
  if (!expected) return { error: `solution ${record.solution[0]} is not a legal move` }
  const state = game.getState()
  const out = { solves: [], moves: {} }
  for (const level of levels) {
    const { ai, holder } = aiFor(family, slug, search, level)
    holder.rng = createRng(seedOf(record.id))
    ai.clear?.()
    const move = ai.pickMove(structuredClone(state.slice), state.players.currentIndex)
    out.moves[level] = move
    if (sameMove(move, expected)) {
      out.solves.push(level)
      if (out.nodes === undefined) {
        const stats = ai.stats()
        out.nodes = stats?.nodesSearched ?? stats?.iterations ?? null
      }
    }
  }
  return out
}

function rate(record, runMcts) {
  const minimax = measure(record, 'minimax')
  if (minimax.error) return { error: minimax.error }
  const ai = { minimax: { solves: minimax.solves, nodes: minimax.nodes ?? null } }
  let mctsExpert = null
  if (runMcts) {
    const mcts = measure(record, 'mcts', ['expert'])
    ai.mcts = { solves: mcts.solves, nodes: mcts.nodes ?? null }
    mctsExpert = mcts.moves?.expert
    ai.disagree = !sameMove(minimax.moves.expert, mctsExpert)
  }
  const difficulty = minimax.solves[0] || 'unsolved'
  return { ai, difficulty }
}

function summarise(data) {
  const rated = [...data.standard, ...data.variants].filter(r => r.difficulty)
  const byDifficulty = {}
  for (const r of rated) byDifficulty[r.difficulty] = (byDifficulty[r.difficulty] || 0) + 1
  data.meta.aiRated = {
    levels: LEVELS,
    deterministic: 'minimax searches a node budget per level, MCTS its iteration count at expert; each record seeded from its id',
    byDifficulty,
    disagreements: rated.filter(r => r.ai?.disagree).length,
  }
  data.meta.unsolvedByEngine = rated
    .filter(r => r.difficulty === 'unsolved' && !(r.ai?.mcts?.solves || []).length)
    .map(r => r.id)
  return byDifficulty
}

function merge(dir) {
  const data = JSON.parse(fs.readFileSync(PUZZLE_FILE, 'utf8'))
  const results = {}
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) Object.assign(results, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  let applied = 0
  for (const record of [...data.standard, ...data.variants]) {
    const result = results[record.id]
    if (!result) continue
    record.ai = result.ai
    record.difficulty = result.difficulty
    applied++
  }
  console.error(`merged ${applied} results`, JSON.stringify(summarise(data)))
  fs.writeFileSync(PUZZLE_FILE, JSON.stringify(data, null, 2) + '\n')
}

function main() {
  if (args.merge) return merge(args.merge)
  const data = JSON.parse(fs.readFileSync(PUZZLE_FILE, 'utf8'))
  const mctsFor = args.mcts || 'variants'
  const ids = args.ids ? new Set(String(args.ids).split(',')) : null
  let pool = [...data.standard.map(r => ['standard', r]), ...data.variants.map(r => ['variants', r])]
  if (args.family) pool = pool.filter(([, r]) => (r.family || 'chess') === args.family)
  if (ids) pool = pool.filter(([, r]) => ids.has(r.id))
  // Records added since the pool was last rated.
  if (args.unrated) pool = pool.filter(([, r]) => !r.difficulty)
  if (args.limit) pool = pool.slice(0, Number(args.limit))
  if (args.shard) {
    const [index, count] = String(args.shard).split('/').map(Number)
    pool = pool.filter((_, i) => i % count === index)
  }
  const results = {}

  const started = Date.now()
  const errors = []
  let done = 0
  for (const [bucket, record] of pool) {
    const runMcts = mctsFor === 'all' || (mctsFor === 'variants' && bucket === 'variants')
    const t = Date.now()
    let result
    try { result = rate(record, runMcts) } catch (e) { result = { error: e.message } }
    if (result.error) {
      errors.push(`${record.id}: ${result.error}`)
      continue
    }
    record.ai = result.ai
    record.difficulty = result.difficulty
    results[record.id] = result
    done++
    if (args.verbose) console.log(record.id, result.difficulty, JSON.stringify(result.ai), `${Date.now() - t}ms`)
  }

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(results))
    console.error(`shard ${args.shard}: rated ${done} of ${pool.length} in ${Math.round((Date.now() - started) / 1000)}s; ${errors.length} could not be rated`)
    for (const e of errors) console.error('  ' + e)
    return
  }
  const byDifficulty = summarise(data)

  console.error(`rated ${done} of ${pool.length} in ${Math.round((Date.now() - started) / 1000)}s; ${errors.length} could not be rated`)
  for (const e of errors.slice(0, 20)) console.error('  ' + e)
  console.error(JSON.stringify(byDifficulty))
  if (!args.dry) fs.writeFileSync(PUZZLE_FILE, JSON.stringify(data, null, 2) + '\n')
}

if (import.meta.url === `file://${process.argv[1]}`) main()
