#!/usr/bin/env node
/**
 * Export board diagrams from the GAMES object — the same data source
 * and rendering path as the board studio.
 *
 * Path: GAMES → reverseAdapt → cascade → renderBoard → SVG
 *
 * This produces output identical to what you see in the studio.
 * The frontmatter migration is tracked separately; this script always
 * uses the GAMES object as the source of truth until that migration
 * is proven complete.
 *
 * Usage:
 *   node scripts/export-boards.mjs                  # report status
 *   node scripts/export-boards.mjs --export         # regenerate all
 *   node scripts/export-boards.mjs --export chess   # single family
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

// Stub DOM so boards.js can load in Node
const stubEl = () => ({ style: {}, innerHTML: '', value: '', appendChild: () => {}, addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, setAttribute: () => {}, getAttribute: () => null, dataset: {}, options: [], getBoundingClientRect: () => ({}) })
globalThis.document = { getElementById: () => stubEl(), createElement: () => stubEl(), createElementNS: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} }
globalThis.window = { location: { search: '' }, addEventListener: () => {} }
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
globalThis.requestAnimationFrame = () => {}
globalThis.URLSearchParams = class { get() { return null } }
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

const { GAMES } = await import('../js/boards.js')
const { reverseAdapt } = await import('../js/reverse-adapter.js')
const { resolveSurface } = await import('../js/surface-resolver.js')
const { resolve: cascadeResolve } = await import('../js/cascade-resolver.js')
const { buildRenderOpts, attachPieceImages } = await import('../js/render-adapter.js')
const { renderBoard } = await import('../js/board-diagrams.js')

const gallery = JSON.parse(readFileSync(resolve(ENGINE_ROOT, 'pieces/gallery-index.json'), 'utf8'))

const args = process.argv.slice(2)
const doExport = args.includes('--export')
const familyFilter = args.filter(a => !a.startsWith('--'))[0] || null

let exported = 0, skipped = 0, errors = 0

for (const [gameId, game] of Object.entries(GAMES)) {
  if (familyFilter && !gameId.includes(familyFilter)) continue
  if (game.noRenderer || game.hexGame || game.rpgGame) continue

  for (const [varId, varDef] of Object.entries(game.variants || {})) {
    if (varDef.noRenderer || varDef.static) continue

    if (!doExport) { exported++; continue }

    try {
      const schema = reverseAdapt(varDef, game, gameId, {})
      const surface = resolveSurface(schema.surface)
      const { resolved } = cascadeResolve({ surface, family: schema.family, variant: schema.variant })
      if (resolved.content?.source) {
        const dp = resolve(ENGINE_ROOT, 'data', resolved.content.source)
        if (existsSync(dp)) resolved.content.data = JSON.parse(readFileSync(dp, 'utf8'))
      }
      const opts = buildRenderOpts(resolved)
      if (!opts) { skipped++; continue }
      attachPieceImages(opts, resolved, gallery)
      const svg = renderBoard(opts)
      if (!svg) { skipped++; continue }

      const diagramDir = resolve(GAMES_DIR, gameId, 'diagrams', 'svg')
      mkdirSync(diagramDir, { recursive: true })
      writeFileSync(resolve(diagramDir, `${varId}-board.svg`), svg)
      exported++
    } catch (e) {
      console.error(`  ✗ ${gameId}/${varId}: ${e.message}`)
      errors++
    }
  }
}

if (!doExport) {
  console.log(`${exported} renderable variants in GAMES. Run with --export to generate.`)
} else {
  console.log(`Done: ${exported} exported, ${skipped} skipped, ${errors} errors`)
}
