#!/usr/bin/env node
/**
 * Build board gallery — produces self-contained SVGs + index.
 *
 * Reads snapshots/, embeds external piece image references as inline <symbol>,
 * writes to boards/svgs/, and generates boards/board-index.json.
 *
 * Usage:
 *   node scripts/build-board-index.mjs           # rebuild
 *   node scripts/build-board-index.mjs --check   # fail if stale, change nothing
 *
 * The gallery is a published surface built from `snapshots/`, and until this
 * check existed nothing in CI looked at it. It drifted silently: the six large
 * shogi boards kept a superseded position and the inverted seat artwork long
 * after both were fixed upstream, and every other board in it was missing a
 * renderer change besides. A surface nobody verifies is a surface that
 * disagrees with the others.
 */

import './lib/dom-stubs.mjs'

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { resolve, basename } from 'path'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
const CHECK_MODE = process.argv.includes('--check')
const stale = []

import {
  ENGINE_ROOT, GAMES_DIR, SNAP_DIR, SVG_DIR,
  loadGallery, listFamilies, familyEngineFor, listVariantFiles,
  embedPieceImages,
} from './lib/board-corpus.mjs'

mkdirSync(SVG_DIR, { recursive: true })

const gallery = loadGallery()
const entries = []
let embedded = 0

for (const family of listFamilies()) {
  const familyEngine = familyEngineFor(family)
  const rbPath = resolve(GAMES_DIR, family, 'content', 'rulebook.md')
  let familyTitle = family.replace(/-/g, ' ')
  if (existsSync(rbPath)) {
    const { meta } = parseFrontmatter(readFileSync(rbPath, 'utf8'))
    if (meta.title) familyTitle = meta.title
  }

  for (const { slug, path: variantPath } of listVariantFiles(family)) {
    const snapFile = `${family}--${slug}.svg`
    const snapPath = resolve(SNAP_DIR, snapFile)
    if (!existsSync(snapPath)) continue

    const { meta } = parseFrontmatter(readFileSync(variantPath, 'utf8'))
    const variantEngine = meta.engine
    const topo = variantEngine?.topology || familyEngine?.topology
    const topoType = topo?.type || 'unknown'
    const pieceSet = variantEngine?.pieces?.set || familyEngine?.pieces?.set || null
    const setDef = pieceSet ? gallery.find(s => s.id === pieceSet) : null

    const rawSvg = readFileSync(snapPath, 'utf8')
    const selfContained = embedPieceImages(rawSvg, setDef)
    const outSvg = resolve(SVG_DIR, snapFile)
    if (CHECK_MODE) {
      const current = existsSync(outSvg) ? readFileSync(outSvg, 'utf8') : null
      if (current !== selfContained) stale.push(`boards/svgs/${snapFile}`)
    } else {
      writeFileSync(outSvg, selfContained)
    }
    embedded++

    entries.push({
      family,
      familyTitle,
      variant: slug,
      variantTitle: meta.title || slug.replace(/-/g, ' '),
      topology: topoType,
      svg: `svgs/${snapFile}`,
    })
  }
}

entries.sort((a, b) => a.family.localeCompare(b.family) || a.variant.localeCompare(b.variant))

const outPath = resolve(ENGINE_ROOT, 'boards', 'board-index.json')
const indexJson = JSON.stringify(entries, null, 2)

if (CHECK_MODE) {
  const indexStale = !existsSync(outPath) || readFileSync(outPath, 'utf8') !== indexJson
  if (indexStale) stale.push('boards/board-index.json')
  if (stale.length) {
    console.error(`✗ ${stale.length} gallery file(s) are stale:\n`)
    for (const f of stale.slice(0, 10)) console.error(`  ${f}`)
    if (stale.length > 10) console.error(`  ... and ${stale.length - 10} more`)
    console.error(`\nRun: node scripts/build-board-index.mjs`)
    process.exit(1)
  }
  console.log(`✓ Board gallery up to date (${entries.length} entries)`)
} else {
  writeFileSync(outPath, indexJson)
  console.log(`Board gallery: ${entries.length} entries, ${embedded} SVGs embedded to boards/svgs/`)
}
