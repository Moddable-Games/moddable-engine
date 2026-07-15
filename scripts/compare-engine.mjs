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

import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')
const SNAP_DIR = resolve(ENGINE_ROOT, 'snapshots')

// DOM stubs
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
const verbose = args.includes('--verbose')
const familyFilter = args.filter(a => !a.startsWith('--'))[0] || null

if (!existsSync(GAMES_DIR)) {
  console.error(`moddable-rules not found at ${RULES_ROOT}`)
  process.exit(1)
}

const TYPE_NORMALIZE = { hexagonal: 'hex', triangular: 'hex' }

let identical = 0, different = 0, skipped = 0, errors = 0, noSnap = 0
const diffs = []

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
  if (!existsSync(varDir)) continue

  for (const file of readdirSync(varDir).filter(f => f.endsWith('.md'))) {
    const slug = basename(file, '.md')
    const { meta } = parseFrontmatter(readFileSync(resolve(varDir, file), 'utf8'))
    const variantEngine = meta.engine

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

      const { resolved, errors: cascadeErrors } = cascadeResolve({
        surface,
        family: { engine: normFam || {}, meta: {} },
        variant: { engine: normVar || {}, meta: { label: meta.title || slug } },
      })

      if (resolved.content?.source) {
        const dp = resolve(ENGINE_ROOT, 'data', resolved.content.source)
        if (existsSync(dp)) resolved.content.data = JSON.parse(readFileSync(dp, 'utf8'))
      }

      // Build piece images
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
          // Find first diff position
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
