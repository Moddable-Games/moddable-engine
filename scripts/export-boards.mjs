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
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import {
  ENGINE_ROOT, GAMES_DIR,
  TYPE_NORMALIZE, loadGallery, parseArgs, walkCorpus, embedPieceImages,
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

    const surfRef = normVar?.surface || normFam?.surface || null
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
}
