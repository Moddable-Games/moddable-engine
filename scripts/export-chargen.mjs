#!/usr/bin/env node
/**
 * Export blank character sheet SVGs from RPG chargen manifests.
 *
 * Reads rpg-manifest.json chargen blocks from moddable-rules, runs the
 * blank-mode render pipeline (pure SVG, no DOM/fetch), and writes A4
 * portrait SVGs to games/{slug}/diagrams/svg/.
 *
 * Usage:
 *   node scripts/export-chargen.mjs                  # report count
 *   node scripts/export-chargen.mjs --export         # generate all
 *   node scripts/export-chargen.mjs --export dnd-5e  # single game
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

// ─── Stub browser globals so rpg-chargen.js can be imported ────────────────
globalThis.location = { hostname: 'node-export' }
globalThis.document = {
  getElementById: () => ({ style: {}, innerHTML: '', appendChild: () => {}, addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] }),
  createElement: () => ({ style: {}, classList: { add: () => {} }, appendChild: () => {}, addEventListener: () => {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
}
globalThis.window = { location: { search: '' }, addEventListener: () => {} }
globalThis.requestAnimationFrame = () => {}
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

// Stub fetch to read from disk (loadRpgManifest uses it)
globalThis.fetch = async (url) => {
  // Extract path from URL — handles both absolute and relative
  let filePath
  if (url.startsWith('http')) {
    const u = new URL(url)
    filePath = resolve(RULES_ROOT, u.pathname.replace(/^\//, ''))
  } else {
    filePath = resolve(RULES_ROOT, url.replace(/^\/MODDABLE\/moddable-rules\//, ''))
  }
  // Strip query string
  filePath = filePath.split('?')[0]

  if (!existsSync(filePath)) {
    return { ok: false, json: () => Promise.resolve(null) }
  }
  const content = readFileSync(filePath, 'utf8')
  return { ok: true, json: () => Promise.resolve(JSON.parse(content)) }
}

// Now import the chargen renderer
const { renderCharacterSheet } = await import('../js/rpg-chargen.js')

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const doExport = args.includes('--export')
const gameFilter = args.filter(a => !a.startsWith('--'))[0] || null

if (!existsSync(GAMES_DIR)) {
  console.error(`moddable-rules not found at ${RULES_ROOT}`)
  process.exit(1)
}

// ─── Find RPGs with chargen blocks ─────────────────────────────────────────
const rpgDirs = readdirSync(GAMES_DIR).filter(f => {
  if (gameFilter && f !== gameFilter) return false
  const manifestPath = resolve(GAMES_DIR, f, 'rpg-manifest.json')
  if (!existsSync(manifestPath)) return false
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return !!manifest.chargen
})

let exported = 0, skipped = 0, errors = 0

for (const gameKey of rpgDirs) {
  if (!doExport) { exported++; continue }

  try {
    const pages = await renderCharacterSheet(gameKey, { mode: 'blank', seed: 42 })
    if (!pages || pages.length === 0) {
      skipped++
      continue
    }

    const diagramDir = resolve(GAMES_DIR, gameKey, 'diagrams', 'svg')
    mkdirSync(diagramDir, { recursive: true })

    for (let i = 0; i < pages.length; i++) {
      const suffix = pages.length > 1 ? `-page-${i + 1}` : ''
      const filename = `${gameKey}-character-sheet${suffix}.svg`
      writeFileSync(resolve(diagramDir, filename), pages[i])
    }

    exported++
    console.log(`  ✓ ${gameKey} (${pages.length} page${pages.length > 1 ? 's' : ''})`)
  } catch (e) {
    console.error(`  ✗ ${gameKey}: ${e.message}`)
    errors++
  }
}

if (!doExport) {
  console.log(`${exported} RPGs with chargen blocks. Run with --export to generate.`)
} else {
  console.log(`Done: ${exported} exported, ${skipped} skipped, ${errors} errors`)
}
