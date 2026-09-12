#!/usr/bin/env node
/**
 * Merges generate-puzzles.mjs output into api/puzzles/index.json.
 *
 * The generator writes a standalone { meta, puzzles } file and nothing consumed
 * it, so every run so far had to be folded in by hand. Hand-merging a corpus is
 * how the last one ended up with 196 records carrying FEN letters their variant
 * never declared, which is exactly what the generator was rewritten to prevent.
 *
 * Rules this enforces, because the corpus is only as trustworthy as its worst
 * record:
 *
 *   1. Records are appended to `variants`, never to `standard`. The standard
 *      pool is sourced (Lichess CC0, Polgar, historical) and must not be
 *      diluted with engine output that carries a different licence.
 *   2. A record whose id already exists is skipped, not overwritten. Re-running
 *      the same seed is idempotent rather than duplicating.
 *   3. A record whose (variantSlug, position, solution) already exists is
 *      skipped too, so a different seed finding the same position does not ship
 *      the same puzzle under two ids.
 *   4. meta counts are recomputed from the arrays rather than incremented, so
 *      they cannot drift away from the data they describe.
 *   5. A record whose first solution move is not legal in the engine that will
 *      have to play it is refused. A puzzle whose answer is not a legal move is
 *      not a hard puzzle, it is a broken record, and a consumer that renders it
 *      hands the player an unsolvable board. This is checked against the
 *      variant's OWN engine, not against chess: three positions once reached
 *      the corpus stamped onto both `diceChess` and `weakChess`, legal in
 *      neither and in standard chess only.
 *
 * Usage:
 *   node scripts/merge-puzzles.mjs out.json [more.json ...] [--dry-run] [--date=YYYY-MM-DD]
 */

import '../packages/play/test-helpers/setup-rules-reader.js'
import '../packages/plugins/index.js'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createGameForVariant, loadFen, findLegalMove } from '../packages/play/src/fen.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const INDEX = path.join(ROOT, 'api', 'puzzles', 'index.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const dateArg = args.find(a => a.startsWith('--date='))
const today = dateArg ? dateArg.slice('--date='.length) : new Date().toISOString().slice(0, 10)
const inputs = args.filter(a => !a.startsWith('--'))

if (!inputs.length) {
  console.error('Usage: node scripts/merge-puzzles.mjs <generated.json> [...] [--dry-run]')
  process.exit(1)
}

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'))
const MANIFEST = path.join(ROOT, 'play', 'playability-manifest.json')
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const variantByKey = new Map(manifest.map(e => [e.key, e.variant]))
const familiesByName = new Map()
for (const e of manifest) {
  for (const name of [e.key, e.variant]) {
    if (!familiesByName.has(name)) familiesByName.set(name, new Set())
    familiesByName.get(name).add(e.family)
  }
}

// Ask the engine that will have to play it, in the family it actually belongs
// to. A slug alone is not an identity - `standard`, `9x9` and `13x13` are each
// used by several families - so a record that does not say its family and
// whose slug is shared cannot be checked, and is refused rather than guessed.
const engines = new Map()
function engineFor(record) {
  const candidates = familiesByName.get(record.variantSlug)
  const family = record.family || (candidates && candidates.size === 1 ? [...candidates][0] : null)
  if (!family) return { error: `"${record.variantSlug}" is used by more than one family and the record does not say which` }
  const slug = variantByKey.get(record.variantSlug) || record.variantSlug
  const cacheKey = `${family}/${slug}`
  if (!engines.has(cacheKey)) {
    try {
      engines.set(cacheKey, { game: createGameForVariant(family, slug) })
    } catch (error) {
      engines.set(cacheKey, { error: error.message })
    }
  }
  return engines.get(cacheKey)
}

function whyUnplayable(record) {
  if (!record.solution || !record.solution.length) return 'no solution recorded'
  const { game, error } = engineFor(record)
  if (error) return error
  try {
    loadFen(game, record.position || record.fen)
  } catch (e) {
    return `engine will not load the position: ${e.message}`
  }
  if (!findLegalMove(game, record.solution[0])) {
    return `"${record.solution[0]}" is not a legal move in this position`
  }
  return null
}
const seenIds = new Set(index.variants.map(r => r.id))
const fingerprint = r => `${r.variantSlug}|${r.position}|${JSON.stringify(r.solution)}`
const seenPositions = new Set(index.variants.map(fingerprint))

let added = 0, dupeId = 0, dupePosition = 0
const rejected = []
const addedByVariant = new Map()

for (const file of inputs) {
  const gen = JSON.parse(fs.readFileSync(file, 'utf8'))
  const records = gen.puzzles || gen.records || []
  for (const r of records) {
    if (seenIds.has(r.id)) { dupeId++; continue }
    if (seenPositions.has(fingerprint(r))) { dupePosition++; continue }
    const unplayable = whyUnplayable(r)
    if (unplayable) { rejected.push({ id: r.id, variantSlug: r.variantSlug, reason: unplayable }); continue }
    seenIds.add(r.id)
    seenPositions.add(fingerprint(r))
    index.variants.push(r)
    added++
    addedByVariant.set(r.variantSlug, (addedByVariant.get(r.variantSlug) || 0) + 1)
  }
  console.log(`${path.basename(file)}: ${records.length} record(s) read`)
}

// Recomputed, never incremented: meta describes the arrays or it is wrong.
index.meta.count = index.standard.length + index.variants.length
index.meta.standard = index.standard.length
index.meta.variants = index.variants.length
index.meta.variantSources = index.meta.variantSources || {}
index.meta.variantSources['engine-generated'] = index.variants.filter(r => r.source === 'engine-generated' || r.generator).length
index.meta.lastUpdated = today
index.meta.lastGeneratedMerge = today

const coverage = new Set(index.variants.map(r => r.variantSlug)).size

console.log(`\nadded ${added}, skipped ${dupeId} duplicate id(s), ${dupePosition} duplicate position(s)`)
if (rejected.length) {
  console.log(`\nrefused ${rejected.length} record(s) whose answer the engine will not play:`)
  for (const r of rejected) console.log(`  ${r.id} (${r.variantSlug}) - ${r.reason}`)
}
console.log(`variants array: ${index.variants.length} records across ${coverage} variants`)
console.log(`corpus total: ${index.meta.count}`)
if (addedByVariant.size) {
  console.log(`new variants covered: ${[...addedByVariant.keys()].length}`)
}

if (dryRun) {
  console.log('\n--dry-run: nothing written')
} else {
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`\nwritten: ${path.relative(ROOT, INDEX)}`)
}
