#!/usr/bin/env node
/**
 * Re-proves every engine-generated puzzle in api/puzzles/index.json against the
 * engine as it is now (engine#178).
 *
 * A generated puzzle is a claim about a variant's rules: exactly one turn wins
 * here. The claim was proved when the record was made, by the rules the engine
 * had then - and the generator had been building variants without their rule
 * modules, so Antichess, Three-check and Giveaway puzzles were proved under
 * standard chess. A claim is only as good as the proof, so this proves each one
 * again with `verifyRecord`, the check the generator itself runs:
 *
 *   - a record whose answer still stands, and only a derived field has moved
 *     (the count of alternatives, the rating, a castling right the variant
 *     does not have written into its FEN), is corrected and kept;
 *   - a record whose answer does not stand is moved to `rejected`, with the
 *     reason, and stops being served.
 *
 * Usage: node scripts/reverify-puzzles.mjs [--dry] [--date=YYYY-MM-DD]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { verifyRecord } from './generate-puzzles.mjs'
import { createGameForVariant, loadFen, toFen } from '../packages/play/src/fen.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INDEX = path.resolve(__dirname, '..', 'api', 'puzzles', 'index.json')
const dry = process.argv.includes('--dry')
const dateArg = process.argv.find(a => a.startsWith('--date='))
const today = dateArg ? dateArg.slice('--date='.length) : new Date().toISOString().slice(0, 10)

const data = JSON.parse(fs.readFileSync(INDEX, 'utf8'))

// Fields a record written before the generator's current schema may lack, and
// a FEN re-expressed by the engine: a castling right or an en passant square
// the variant does not have is dropped when the position is loaded.
function normalised(record) {
  const out = { ...record, shape: record.shape || 'win' }
  let game
  try { game = createGameForVariant(record.family, record.variantSlug) } catch { return out }
  if (!record.state) {
    try {
      loadFen(game, record.position)
      out.position = toFen(game)
      // A generated record's FEN is its position: nothing was played to reach
      // it. The normaliser rebuilds `position` from `fen`, so both change.
      if (!record.setupMove) out.fen = out.position
    } catch { return out }
  }
  const mover = record.state ? record.state.players.currentIndex : game.getState().players.currentIndex
  out.moverIndex = mover
  out.moverName = game.raw.playerSystem.getAll()[mover] || record.moverName
  return out
}

const kept = []
const rejected = []
let repaired = 0
for (const record of data.variants) {
  if (record.source !== 'engine-generated') { kept.push(record); continue }
  const candidate = normalised(record)
  let verdict
  try { verdict = verifyRecord(candidate, { repair: true }) } catch (error) { verdict = { ok: false, reason: `verification threw: ${error.message}` } }
  if (!verdict.ok) {
    rejected.push({ ...record, rejectedReason: verdict.reason, rejectedOn: today })
    continue
  }
  const changed = { ...candidate, ...(verdict.repaired || {}) }
  if (JSON.stringify(changed) !== JSON.stringify(record)) repaired++
  kept.push(changed)
}

const byReason = {}
for (const r of rejected) {
  const key = r.rejectedReason.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N')
  byReason[key] = (byReason[key] || 0) + 1
}
console.log(`re-proved ${data.variants.length} variant records: ${kept.length} kept (${repaired} corrected), ${rejected.length} rejected`)
for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  ${reason}`)

if (!dry) {
  data.variants = kept
  data.rejected = [...(data.rejected || []), ...rejected]
  data.meta.variants = kept.length
  data.meta.count = data.standard.length + kept.length
  data.meta.rejected = data.rejected.length
  data.meta.reverified = today
  fs.writeFileSync(INDEX, JSON.stringify(data, null, 2) + '\n')
}
