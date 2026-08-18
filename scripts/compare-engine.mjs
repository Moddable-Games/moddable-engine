#!/usr/bin/env node
/**
 * Compare renderFromEngine output vs saved snapshots.
 *
 * Identifies which variants differ when rendered through the new engine path
 * (render-engine.js) vs the legacy path (render-adapter → board-diagrams).
 *
 * Usage:
 *   node scripts/compare-engine.mjs                # full report
 *   node scripts/compare-engine.mjs chess          # single family
 *   node scripts/compare-engine.mjs --verbose      # show first diff chars
 */

import './lib/dom-stubs.mjs'

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import {
  ENGINE_ROOT, SNAP_DIR,
  TYPE_NORMALIZE, loadGallery, parseArgs, walkCorpus,
} from './lib/board-corpus.mjs'

const gallery = loadGallery()
const { verbose, familyFilter } = parseArgs()

let identical = 0, different = 0, skipped = 0, errors = 0, noSnap = 0
const diffs = []

for (const { family, familyEngine, slug, meta, engine: variantEngine } of walkCorpus({ familyFilter })) {
  if (!variantEngine && !familyEngine) { skipped++; continue }
  const topo = variantEngine?.topology || familyEngine?.topology
  if (!topo?.type) { skipped++; continue }

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
    const engineOpts = {
      pieceImages: pieceResult.images || {},
      pieceSurfaceMap: pieceResult.surfaceMap || {},
      pieceSurface: pieceResult.surface || null,
    }

    const svg = renderFromEngine(resolved, engineOpts)
    if (!svg) { skipped++; continue }

    const snapPath = resolve(SNAP_DIR, `${family}--${slug}.svg`)
    if (!existsSync(snapPath)) { noSnap++; continue }

    const saved = readFileSync(snapPath, 'utf8')
    if (saved === svg) {
      identical++
    } else {
      different++
      let detail = ''
      if (verbose) {
        let pos = 0
        while (pos < saved.length && pos < svg.length && saved[pos] === svg[pos]) pos++
        const ctx = 60
        detail = `\n    expected: ...${saved.slice(Math.max(0, pos - 20), pos + ctx)}...`
        detail += `\n    got:      ...${svg.slice(Math.max(0, pos - 20), pos + ctx)}...`
      }
      diffs.push(`  ✗ ${family}/${slug}${detail}`)
    }
  } catch (e) {
    errors++
    diffs.push(`  ✗ ${family}/${slug}: ERROR — ${e.message}`)
  }
}

console.log(`\nrender-engine vs snapshots:`)
console.log(`  ${identical} identical`)
console.log(`  ${different} different`)
console.log(`  ${errors} errors`)
console.log(`  ${noSnap} no snapshot`)
console.log(`  ${skipped} skipped (no engine block)\n`)

if (diffs.length > 0) {
  console.log('Failures:')
  for (const d of diffs) console.log(d)
}
