#!/usr/bin/env node
/**
 * Normalises api/puzzles/index.json to schema version 2.
 *
 * 912 of the 1,118 standard puzzles carry a `setupMove`: for those, `fen` is
 * the position BEFORE the opponent's blunder and the solver actually faces the
 * position AFTER the setup move has been played. Nothing in the data said so,
 * so every consumer that got it right did it with its own hand-rolled edit of
 * the FEN string — and a string edit forgets castling rights, the en-passant
 * square, the clocks, the rook when the move is a castle, and the pawn when the
 * capture is en passant. This script kills that at the source by writing the
 * position the solver faces into the data itself, computed by loading the FEN
 * into a real game and playing the move through the engine that owns the rules.
 *
 * The rewrite is purely additive. `fen`, `setupMove`, `solution`, `rating`,
 * `themes`, `id` and `source` are never touched. Added per record:
 *
 *   position     the FEN the solver faces (setupMove ? engine(fen, setupMove) : fen)
 *   turn         'white' | 'black', the side to move in `position`
 *   variantSlug  the canonical key from play/playability-manifest.json
 *
 * Run with --check to verify the file on disk is up to date (exits non-zero
 * with a diff summary if it is stale). The date stamped into meta.normalised
 * comes from --date= or PUZZLE_DATE so runs are reproducible.
 *
 * Usage:
 *   node scripts/normalise-puzzles.mjs [--check] [--date=YYYY-MM-DD]
 */

// Wire the rules reader before plugin registration, then register chess.
import '../packages/play/test-helpers/setup-rules-reader.js'
import '../packages/plugins/chess/index.js'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fenAfterMove } from '../packages/play/src/fen.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CHECK_MODE = process.argv.includes('--check')
const DATE_ARG = process.argv.find(a => a.startsWith('--date='))
const DEFAULT_DATE = '2026-08-15'
const DATE = (DATE_ARG ? DATE_ARG.slice('--date='.length) : process.env.PUZZLE_DATE) || DEFAULT_DATE

const PUZZLE_FILE = 'api/puzzles/index.json'
const MANIFEST_FILE = 'play/playability-manifest.json'
const FAMILY = 'chess'
// Records in standard[] carry no `variant` — they are plain chess by definition.
const STANDARD_VARIANT = 'standard'

function resolve_(...segments) {
  return path.resolve(ROOT, ...segments)
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(resolve_(filePath), 'utf-8'))
}

// --- Variant slug resolution ------------------------------------------------

// The pool stores camelCase variant names ("almostChess") while the manifest
// uses kebab-case for many keys ("almost-chess") and drops the redundant
// "Chess" suffix for a couple more ("dianaChess" -> "diana"). Candidates are
// tried most-literal first so an exact key always wins.
function kebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function slugCandidates(variant) {
  const stripped = variant.replace(/Chess$/, '')
  return [...new Set([variant, kebab(variant), stripped, kebab(stripped)])].filter(Boolean)
}

function buildSlugResolver(manifest) {
  const keys = new Set(manifest.filter(entry => entry.family === FAMILY).map(entry => entry.key))
  const mappings = new Map()
  const unresolved = new Map()

  function resolveSlug(variant) {
    if (mappings.has(variant)) return mappings.get(variant)
    const match = slugCandidates(variant).find(candidate => keys.has(candidate))
    if (!match) {
      unresolved.set(variant, (unresolved.get(variant) || 0) + 1)
      return null
    }
    mappings.set(variant, match)
    return match
  }

  return { resolveSlug, mappings, unresolved }
}

// --- Position computation ---------------------------------------------------

function turnOf(fen) {
  return String(fen).trim().split(/\s+/)[1] === 'b' ? 'black' : 'white'
}

/**
 * The position the solver faces. With no setupMove the FEN already is it; with
 * one, the engine plays the move — so castling moves the rook, en passant
 * removes the captured pawn, rights are revoked and the clocks advance without
 * this script knowing a single chess rule.
 */
function positionFor(record, slug) {
  if (!record.setupMove) return record.fen
  return fenAfterMove(FAMILY, slug, record.fen, record.setupMove)
}

// --- Normalisation ----------------------------------------------------------

function normalise(data) {
  const manifest = readJSON(MANIFEST_FILE)
  const { resolveSlug, mappings, unresolved } = buildSlugResolver(manifest)

  const stats = { setupApplied: 0, positionDiffers: 0, setupFailed: [] }

  function normaliseRecord(record, defaultVariant) {
    const variant = record.variant || defaultVariant
    const slug = resolveSlug(variant)
    if (!slug) return { ...record }

    let position
    try {
      position = positionFor(record, slug)
    } catch (error) {
      // A setup move the engine will not play means the record's own data is
      // inconsistent. Surface it rather than silently writing `fen` as the
      // position and pretending the puzzle is fine.
      stats.setupFailed.push({ id: record.id, variant, setupMove: record.setupMove, reason: error.message })
      position = record.fen
    }

    if (record.setupMove) stats.setupApplied++
    if (position !== record.fen) stats.positionDiffers++

    return { ...record, position, turn: turnOf(position), variantSlug: slug }
  }

  const normalised = {
    ...data,
    meta: { ...data.meta, schemaVersion: 2, normalised: DATE },
    standard: data.standard.map(r => normaliseRecord(r, STANDARD_VARIANT)),
    variants: data.variants.map(r => normaliseRecord(r, STANDARD_VARIANT)),
  }

  if (unresolved.size > 0) {
    const lines = [...unresolved.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([variant, count]) => `  ${variant} (${count} puzzle${count === 1 ? '' : 's'}) — tried: ${slugCandidates(variant).join(', ')}`)
    console.error(`\n${unresolved.size} variant value(s) could not be resolved to a key in ${MANIFEST_FILE}:`)
    console.error(lines.join('\n'))
    console.error('\nAdd the variant to the manifest or correct the pool. Refusing to guess.')
    process.exit(1)
  }

  return { normalised, mappings, stats }
}

// --- Run --------------------------------------------------------------------

const data = readJSON(PUZZLE_FILE)
const { normalised, mappings, stats } = normalise(data)

const remapped = [...mappings.entries()].filter(([variant, slug]) => variant !== slug)

console.log(`Normalising ${PUZZLE_FILE} (schemaVersion 2, normalised ${DATE})`)
console.log(`  Records: ${normalised.standard.length} standard + ${normalised.variants.length} variants`)
console.log(`  setupMove applied: ${stats.setupApplied}`)
console.log(`  position differs from fen: ${stats.positionDiffers}`)
console.log(`  variant values needing slug mapping: ${remapped.length}`)
for (const [variant, slug] of remapped) console.log(`    ${variant} -> ${slug}`)
if (stats.setupFailed.length > 0) {
  console.log(`  setupMove the engine refused: ${stats.setupFailed.length}`)
  for (const failure of stats.setupFailed.slice(0, 10)) {
    console.log(`    ${failure.id} (${failure.variant}) ${failure.setupMove}: ${failure.reason}`)
  }
}

const content = JSON.stringify(normalised, null, 2) + '\n'
const fullPath = resolve_(PUZZLE_FILE)
const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : ''

if (existing === content) {
  console.log(`\n  ✓ ${PUZZLE_FILE} (up to date)`)
  process.exit(0)
}

if (CHECK_MODE) {
  const onDisk = existing ? JSON.parse(existing) : { meta: {}, standard: [], variants: [] }
  console.log(`\n  ✗ ${PUZZLE_FILE} (STALE)`)
  console.log(diffSummary(onDisk, normalised))
  console.error(`\nRun: node scripts/normalise-puzzles.mjs`)
  process.exit(1)
}

fs.writeFileSync(fullPath, content)
console.log(`\n  → ${PUZZLE_FILE} (updated)`)

function diffSummary(before, after) {
  const lines = []
  if (before.meta?.schemaVersion !== after.meta.schemaVersion) {
    lines.push(`    meta.schemaVersion: ${before.meta?.schemaVersion ?? '(absent)'} -> ${after.meta.schemaVersion}`)
  }
  if (before.meta?.normalised !== after.meta.normalised) {
    lines.push(`    meta.normalised: ${before.meta?.normalised ?? '(absent)'} -> ${after.meta.normalised}`)
  }
  for (const bucket of ['standard', 'variants']) {
    const byId = new Map((before[bucket] || []).map(r => [r.id, r]))
    const missing = { position: 0, turn: 0, variantSlug: 0 }
    let changed = 0
    let absent = 0
    for (const record of after[bucket]) {
      const old = byId.get(record.id)
      if (!old) { absent++; continue }
      for (const field of ['position', 'turn', 'variantSlug']) {
        if (old[field] === undefined) missing[field]++
        else if (old[field] !== record[field]) changed++
      }
    }
    const parts = Object.entries(missing).filter(([, n]) => n > 0).map(([f, n]) => `${n} missing ${f}`)
    if (changed > 0) parts.push(`${changed} changed field(s)`)
    if (absent > 0) parts.push(`${absent} record(s) not on disk`)
    if (parts.length > 0) lines.push(`    ${bucket}: ${parts.join(', ')}`)
  }
  return lines.length > 0 ? lines.join('\n') : '    (formatting only)'
}
