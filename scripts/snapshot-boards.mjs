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

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')
const SNAP_DIR = resolve(ENGINE_ROOT, 'snapshots')

// DOM stubs for boards.js module-level references
const stubEl = () => ({ style: {}, innerHTML: '', value: '', appendChild: () => {}, addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, setAttribute: () => {}, getAttribute: () => null, dataset: {}, options: [], getBoundingClientRect: () => ({}) })
globalThis.document = { getElementById: () => stubEl(), createElement: () => stubEl(), createElementNS: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} }
globalThis.window = { location: { search: '' }, addEventListener: () => {} }
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
globalThis.requestAnimationFrame = () => {}
globalThis.URLSearchParams = class { get() { return null } }
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'

const gallery = JSON.parse(readFileSync(resolve(ENGINE_ROOT, 'pieces/gallery-index.json'), 'utf8'))

const args = process.argv.slice(2)
const doCapture = args.includes('--capture')
const doDiff = args.includes('--diff')
const verbose = args.includes('--verbose')
const familyFilter = args.filter(a => !a.startsWith('--'))[0] || null

if (!existsSync(GAMES_DIR)) {
  console.error(`moddable-rules not found at ${RULES_ROOT}`)
  process.exit(1)
}

const TYPE_NORMALIZE = { hexagonal: 'hex', triangular: 'hex' }

let count = 0, captured = 0, skipped = 0, errors = 0
let identical = 0, different = 0, missing = 0

const families = readdirSync(GAMES_DIR).filter(f => {
  if (familyFilter && !f.includes(familyFilter)) return false
  return existsSync(resolve(GAMES_DIR, f, 'content'))
})

for (const family of families) {
  const rbPath = resolve(GAMES_DIR, family, 'content', 'rulebook.md')
  let familyEngine = null
  if (existsSync(rbPath)) {
    const { meta } = parseFrontmatter(readFileSync(rbPath, 'utf8'))
    if (meta.engine) familyEngine = meta.engine
  }

  const varDir = resolve(GAMES_DIR, family, 'content', 'variants')
  const gamesDir = resolve(GAMES_DIR, family, 'content', 'games')

  const variantFiles = []
  if (existsSync(varDir)) {
    for (const file of readdirSync(varDir).filter(f => f.endsWith('.md'))) {
      variantFiles.push({ slug: basename(file, '.md'), path: resolve(varDir, file) })
    }
  }
  if (existsSync(gamesDir)) {
    for (const gameDir of readdirSync(gamesDir)) {
      const stdPath = resolve(gamesDir, gameDir, 'standard.md')
      if (existsSync(stdPath)) variantFiles.push({ slug: gameDir, path: stdPath })
      const altFiles = existsSync(resolve(gamesDir, gameDir)) ? readdirSync(resolve(gamesDir, gameDir)).filter(f => f.endsWith('.md') && f !== 'standard.md') : []
      for (const alt of altFiles) {
        variantFiles.push({ slug: `${gameDir}-${basename(alt, '.md')}`, path: resolve(gamesDir, gameDir, alt) })
      }
    }
  }
  if (variantFiles.length === 0) continue

  for (const { slug, path: variantPath } of variantFiles) {
    const { meta } = parseFrontmatter(readFileSync(variantPath, 'utf8'))
    const variantEngine = meta.engine

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

      const { resolved, errors: cascadeErrors } = cascadeResolve({
        surface,
        family: { engine: normFam || {}, meta: {} },
        variant: { engine: normVar || {}, meta: { label: meta.title || slug } },
      })

      if (resolved.content?.source) {
        const dp = resolve(ENGINE_ROOT, 'data', resolved.content.source)
        if (existsSync(dp)) resolved.content.data = JSON.parse(readFileSync(dp, 'utf8'))
      }

      const pieceResult = attachPieceImages(resolved, gallery)
      const svg = renderFromEngine(resolved, {
        pieceImages: pieceResult.images || {},
        pieceSurfaceMap: pieceResult.surfaceMap || {},
        pieceSurface: pieceResult.surface || null,
      })
      if (!svg) { skipped++; continue }

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
}

if (!doCapture && !doDiff) {
  console.log(`${count} renderable variants. Use --capture to save snapshots, --diff to compare.`)
} else if (doCapture) {
  console.log(`Captured: ${captured}, skipped: ${skipped}, errors: ${errors}`)
} else if (doDiff) {
  console.log(`\nResults: ${identical} identical, ${different} different, ${missing} no snapshot, ${errors} errors`)
  if (different > 0) process.exit(1)
}
