#!/usr/bin/env node
/**
 * Export board diagrams from moddable-rules frontmatter.
 *
 * Reads engine: blocks from variant files, runs through the cascade
 * pipeline, and produces SVGs identical to the board studio Schema mode.
 *
 * Usage:
 *   node scripts/export-boards.mjs                  # report count
 *   node scripts/export-boards.mjs --export         # generate all
 *   node scripts/export-boards.mjs --export chess   # single family
 *   node scripts/export-boards.mjs --sync           # export only changed variants
 *   node scripts/export-boards.mjs --sync chess     # sync single family
 */

import './lib/dom-stubs.mjs'

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'
import { resolveSurface, effectiveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import {
  ENGINE_ROOT, GAMES_DIR,
  TYPE_NORMALIZE, loadGallery, parseArgs, walkCorpus, embedPieceImages, missingPieceFiles,
} from './lib/board-corpus.mjs'

const gallery = loadGallery()
const { verbose, familyFilter, has } = parseArgs()
const doSync = has('--sync')
const doExport = has('--export') || doSync

const CACHE_PATH = resolve(ENGINE_ROOT, '.export-cache.json')
const cache = doSync && existsSync(CACHE_PATH)
  ? JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  : {}
const newCache = {}

function hashEngine(variantPath) {
  const content = readFileSync(variantPath, 'utf8')
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

let exported = 0, skipped = 0, errors = 0, unchanged = 0

for (const { family, familyEngine, slug, path: variantPath, meta, engine: variantEngine } of walkCorpus({ familyFilter })) {
  if (!variantEngine && !familyEngine) { skipped++; continue }
  const topo = variantEngine?.topology || familyEngine?.topology
  if (!topo?.type) { skipped++; continue }

  if (!doExport) { exported++; continue }

  const cacheKey = `${family}/${slug}`
  const hash = hashEngine(variantPath)
  newCache[cacheKey] = hash

  if (doSync && cache[cacheKey] === hash) {
    unchanged++
    if (verbose) console.log(`  = ${cacheKey} (unchanged)`)
    continue
  }

  try {
    const normType = TYPE_NORMALIZE[topo.type] || topo.type
    const normFam = familyEngine && familyEngine.topology
      ? { ...familyEngine, topology: { ...familyEngine.topology, type: TYPE_NORMALIZE[familyEngine.topology.type] || familyEngine.topology.type } }
      : familyEngine
    const normVar = variantEngine && variantEngine.topology
      ? { ...variantEngine, topology: { ...variantEngine.topology, type: normType } }
      : variantEngine

    // The same declaration play resolves (resolve-frontmatter.js), so a board
    // and the game played on it are drawn in the same colours.
    const surfRef = effectiveSurface(normFam?.surface, normVar?.surface) || null
    const surface = surfRef ? resolveSurface(surfRef) : {}

    const { resolved } = cascadeResolve({
      surface,
      family: { engine: normFam || {}, meta: {} },
      variant: { engine: normVar || {}, meta: { label: meta.title || slug } },
    })

    if (resolved.content?.source) {
      const dp = resolve(ENGINE_ROOT, 'data', resolved.content.source)
      if (existsSync(dp)) resolved.content.data = JSON.parse(readFileSync(dp, 'utf8'))
    }

    const pieceResult = attachPieceImages(resolved, gallery)
    const rawSvg = renderFromEngine(resolved, {
      pieceImages: pieceResult.images || {},
      pieceSurfaceMap: pieceResult.surfaceMap || {},
      pieceSurface: pieceResult.surface || null,
    })
    if (!rawSvg) { skipped++; continue }

    const pieceSetId = resolved.pieces?.set
    const setDef = pieceSetId ? gallery.find(s => s.id === pieceSetId) : null

    // A board with pieces in its setup and none in its picture is not a
    // diagram, it is a mistake that looks like one - and writing it out is how
    // Congo lost its seven animals twice, silently, to a sync run against an
    // engine checkout where its piece set did not yet exist. The renderer will
    // happily draw an empty board; nothing downstream can tell that apart from
    // a board that is meant to be empty. This can.
    //
    // It asks the two exact questions rather than reading letters in the setup
    // string. That heuristic refused eight boards that are right to be empty:
    // Pachisi and Acey-Deucey start every piece in `home:`, and a Nukes setup
    // names terrain, not pieces.
    if (pieceSetId && !setDef) {
      console.error(`✗ ${family}/${slug}: piece set "${pieceSetId}" is not in pieces/gallery-index.json. Board not written.`)
      errors++
      continue
    }
    const missing = missingPieceFiles(rawSvg)
    if (missing.length) {
      console.error(`✗ ${family}/${slug}: ${missing.length} piece file(s) not in this checkout, e.g. ${missing[0]}. Board not written.`)
      errors++
      continue
    }

    const svg = embedPieceImages(rawSvg, setDef)

    const diagramDir = resolve(GAMES_DIR, family, 'diagrams', 'svg')
    mkdirSync(diagramDir, { recursive: true })
    writeFileSync(resolve(diagramDir, `${slug}-board.svg`), svg)
    exported++
    if (verbose) console.log(`  ✓ ${family}/${slug}`)
  } catch (e) {
    console.error(`  ✗ ${family}/${slug}: ${e.message}`)
    errors++
  }
}

if (!doExport) {
  console.log(`${exported} renderable variants. Run with --export to generate.`)
} else {
  const parts = [`${exported} exported`, `${skipped} skipped`, `${errors} errors`]
  if (doSync) parts.push(`${unchanged} unchanged`)
  console.log(`Done: ${parts.join(', ')}`)
  if (doSync) writeFileSync(CACHE_PATH, JSON.stringify(newCache, null, 2))
  // A refused board has to stop the caller. moddable-rules' sync-boards.sh
  // runs under `set -e` and refreshes its freshness hashes after this exits;
  // exiting 0 would record a board that was never written as up to date.
  if (errors) process.exitCode = 1
}
