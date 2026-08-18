#!/usr/bin/env node
/**
 * Build board gallery — produces self-contained SVGs + index.
 *
 * Reads snapshots/, embeds external piece image references as inline <symbol>,
 * writes to boards/svgs/, and generates boards/board-index.json.
 *
 * Usage: node scripts/build-board-index.mjs
 */

import './lib/dom-stubs.mjs'

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { resolve, basename } from 'path'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
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
    writeFileSync(resolve(SVG_DIR, snapFile), selfContained)
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
writeFileSync(outPath, JSON.stringify(entries, null, 2))
console.log(`Board gallery: ${entries.length} entries, ${embedded} SVGs embedded to boards/svgs/`)
