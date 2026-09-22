#!/usr/bin/env node
/**
 * Snapshot board SVGs — captures the current board-diagrams.js output as reference.
 *
 * These snapshots are the acceptance test for provider migration:
 * after moving providers into topology packages, the output must be byte-identical.
 *
 * Usage:
 *   node scripts/snapshot-boards.mjs              # report count
 *   node scripts/snapshot-boards.mjs --capture    # save all SVGs to snapshots/
 *   node scripts/snapshot-boards.mjs --diff       # compare current output vs saved snapshots
 */

import './lib/dom-stubs.mjs'

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { renderFromEngine, attachPieceImages, depictionMismatches } from '../packages/render/src/render-engine.js'
import {
  ENGINE_ROOT, SNAP_DIR,
  TYPE_NORMALIZE, loadGallery, parseArgs, walkCorpus,
} from './lib/board-corpus.mjs'

const gallery = loadGallery()
const { verbose, familyFilter, has } = parseArgs()
const doCapture = has('--capture')
const doDiff = has('--diff')

let count = 0, captured = 0, skipped = 0, errors = 0
const nullRenders = []
const standIns = []
let identical = 0, different = 0, missing = 0

for (const { family, familyEngine, slug, meta, engine: variantEngine } of walkCorpus({ familyFilter })) {
  if (!variantEngine && !familyEngine) { skipped++; continue }
  const topo = variantEngine?.topology || familyEngine?.topology
  if (!topo?.type) { skipped++; continue }

  count++
  if (!doCapture && !doDiff) continue

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
    const drawnAsOther = new Set()
    const svg = renderFromEngine(resolved, {
      pieceImages: pieceResult.images || {},
      pieceSurfaceMap: pieceResult.surfaceMap || {},
      pieceSurface: pieceResult.surface || null,
      onStandIn: (cell, symbol, key) => drawnAsOther.add(`${typeof symbol === 'object' ? symbol.symbol ?? symbol.type : symbol} as ${key}`),
    })
    // A piece with no artwork of its own is drawn with the set's fallback key,
    // which in a set of many pieces is another piece. The board looks complete
    // and the snapshot matches, so nothing else notices (Taikyoku's mountain
    // eagles drew as a gote Silver General).
    // A letter that resolves to a real image of a different piece, which the
    // stand-in check cannot see because nothing fell back (engine#180).
    for (const m of depictionMismatches(resolved, gallery, pieceResult.images || {})) drawnAsOther.add(m)
    if (drawnAsOther.size) standIns.push(`${family}/${slug}: ${[...drawnAsOther].sort().join(', ')}`)
    // A variant whose render returns null is invisible to every guard: the
    // render tests skip anything returning null and the playability tests skip
    // anything not marked playable, so a variant that is both is checked by
    // nothing. san-kwo-ki sat in that gap (engine#144, engine#142). Name them.
    if (!svg) { nullRenders.push(`${family}/${slug}`); skipped++; continue }

    const snapPath = resolve(SNAP_DIR, `${family}--${slug}.svg`)

    if (doCapture) {
      writeFileSync(snapPath, svg)
      captured++
      if (verbose) console.log(`  ✓ ${family}/${slug}`)
    }

    if (doDiff) {
      if (!existsSync(snapPath)) {
        missing++
        if (verbose) console.log(`  ? ${family}/${slug} (no snapshot)`)
      } else {
        const saved = readFileSync(snapPath, 'utf8')
        if (saved === svg) {
          identical++
        } else {
          different++
          console.log(`  ✗ ${family}/${slug} DIFFERS`)
        }
      }
    }
  } catch (e) {
    console.error(`  ✗ ${family}/${slug}: ${e.message}`)
    errors++
  }
}

if (nullRenders.length) {
  console.log(`\nRendered null (checked by no other guard): ${nullRenders.length}`)
  for (const n of nullRenders) console.log(`  - ${n}`)
}

if (standIns.length) {
  console.log(`\nDrawn with another piece's artwork: ${standIns.length}`)
  for (const n of standIns) console.log(`  ~ ${n}`)
}

if (!doCapture && !doDiff) {
  console.log(`${count} renderable variants. Use --capture to save snapshots, --diff to compare.`)
} else if (doCapture) {
  console.log(`Captured: ${captured}, skipped: ${skipped}, errors: ${errors}`)
} else if (doDiff) {
  console.log(`\nResults: ${identical} identical, ${different} different, ${missing} no snapshot, ${errors} errors`)
  if (different > 0) process.exit(1)
}
