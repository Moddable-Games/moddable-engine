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
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

import { resolveSurface } from '../js/surface-resolver.js'
import { resolve as cascadeResolve } from '../js/cascade-resolver.js'
import { buildRenderOpts, attachPieceImages } from '../js/render-adapter.js'
import { renderBoard } from '../js/board-diagrams.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'

const gallery = JSON.parse(readFileSync(resolve(ENGINE_ROOT, 'pieces/gallery-index.json'), 'utf8'))

const args = process.argv.slice(2)
const doExport = args.includes('--export')
const verbose = args.includes('--verbose')
const familyFilter = args.filter(a => !a.startsWith('--'))[0] || null

if (!existsSync(GAMES_DIR)) {
  console.error(`moddable-rules not found at ${RULES_ROOT}`)
  process.exit(1)
}

const TYPE_NORMALIZE = { hexagonal: 'hex', triangular: 'hex' }

let exported = 0, skipped = 0, errors = 0

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

    if (!doExport) { exported++; continue }

    try {
      // Normalize topology type
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

      // Load content data if needed
      if (resolved.content?.source) {
        const dp = resolve(ENGINE_ROOT, 'data', resolved.content.source)
        if (existsSync(dp)) resolved.content.data = JSON.parse(readFileSync(dp, 'utf8'))
      }

      const opts = buildRenderOpts(resolved)
      if (!opts) { skipped++; continue }
      attachPieceImages(opts, resolved, gallery)

      const svg = renderBoard(opts)
      if (!svg) { skipped++; continue }

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
}

if (!doExport) {
  console.log(`${exported} renderable variants. Run with --export to generate.`)
} else {
  console.log(`Done: ${exported} exported, ${skipped} skipped, ${errors} errors`)
}
