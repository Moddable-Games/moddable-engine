#!/usr/bin/env node
/**
 * Build board gallery index from snapshots + frontmatter metadata.
 *
 * Produces boards/board-index.json with family, variant, topology type,
 * and SVG path for each rendered board.
 *
 * Usage: node scripts/build-board-index.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')
const SNAP_DIR = resolve(ENGINE_ROOT, 'snapshots')

import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'

const entries = []

const families = readdirSync(GAMES_DIR).filter(f =>
  existsSync(resolve(GAMES_DIR, f, 'content'))
)

for (const family of families) {
  const rbPath = resolve(GAMES_DIR, family, 'content', 'rulebook.md')
  let familyEngine = null
  let familyTitle = family.replace(/-/g, ' ')
  if (existsSync(rbPath)) {
    const { meta } = parseFrontmatter(readFileSync(rbPath, 'utf8'))
    if (meta.engine) familyEngine = meta.engine
    if (meta.title) familyTitle = meta.title
  }

  const varDir = resolve(GAMES_DIR, family, 'content', 'variants')
  if (!existsSync(varDir)) continue

  for (const file of readdirSync(varDir).filter(f => f.endsWith('.md'))) {
    const slug = basename(file, '.md')
    const snapFile = `${family}--${slug}.svg`
    const snapPath = resolve(SNAP_DIR, snapFile)
    if (!existsSync(snapPath)) continue

    const { meta } = parseFrontmatter(readFileSync(resolve(varDir, file), 'utf8'))
    const variantEngine = meta.engine
    const topo = variantEngine?.topology || familyEngine?.topology
    const topoType = topo?.type || 'unknown'

    entries.push({
      family,
      familyTitle,
      variant: slug,
      variantTitle: meta.title || slug.replace(/-/g, ' '),
      topology: topoType,
      svg: `../snapshots/${snapFile}`,
    })
  }
}

entries.sort((a, b) => a.family.localeCompare(b.family) || a.variant.localeCompare(b.variant))

const outPath = resolve(ENGINE_ROOT, 'boards', 'board-index.json')
writeFileSync(outPath, JSON.stringify(entries, null, 2))
console.log(`Board index: ${entries.length} entries written to boards/board-index.json`)
