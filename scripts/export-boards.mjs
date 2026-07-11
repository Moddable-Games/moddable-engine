#!/usr/bin/env node
/**
 * Export board diagrams from moddable-rules frontmatter to SVG files.
 *
 * Reads engine: blocks from variant/rulebook files, runs the produce pipeline,
 * and writes SVG diagrams to games/{family}/diagrams/svg/.
 *
 * Usage:
 *   node scripts/export-boards.mjs                    # all families
 *   node scripts/export-boards.mjs chess              # single family
 *   node scripts/export-boards.mjs chess standard     # single variant
 *   node scripts/export-boards.mjs --dry-run          # preview without writing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = resolve(ENGINE_ROOT, '../moddable-rules')

import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { produceLayout } from '../packages/schema/src/produce-layout.js'
import { createGridTopology } from '../packages/topology-grid/src/topology-grid.js'
import { createHexTopology } from '../packages/topology-hex/src/topology-hex.js'
import { createPitTopology } from '../packages/topology-pit/src/topology-pit.js'
import { createGraphTopology } from '../packages/topology-graph/src/topology-graph.js'
import { createTrackTopology } from '../packages/topology-track/src/topology-track.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const filterArgs = args.filter(a => !a.startsWith('--'))
const familyFilter = filterArgs[0] || null
const variantFilter = filterArgs[1] || null

const GAMES_DIR = resolve(RULES_ROOT, 'games')

function main() {
  if (!existsSync(GAMES_DIR)) {
    console.error(`moddable-rules not found at ${RULES_ROOT}`)
    process.exit(1)
  }

  const families = readdirSync(GAMES_DIR).filter(f => {
    if (familyFilter && !f.includes(familyFilter)) return false
    const contentDir = resolve(GAMES_DIR, f, 'content')
    return existsSync(contentDir)
  })

  let generated = 0, skipped = 0, errors = 0

  for (const family of families) {
    const familyDir = resolve(GAMES_DIR, family, 'content')
    const variantsDir = resolve(familyDir, 'variants')
    const diagramDir = resolve(GAMES_DIR, family, 'diagrams', 'svg')

    const rulebook = resolve(familyDir, 'rulebook.md')
    let familyDefaults = null
    if (existsSync(rulebook)) {
      const { meta } = parseFrontmatter(readFileSync(rulebook, 'utf8'))
      if (meta.engine) familyDefaults = meta.engine
    }

    if (!existsSync(variantsDir)) continue
    const variantFiles = readdirSync(variantsDir).filter(f => f.endsWith('.md'))

    for (const file of variantFiles) {
      const slug = basename(file, '.md')
      if (variantFilter && slug !== variantFilter) continue

      const content = readFileSync(resolve(variantsDir, file), 'utf8')
      const { meta } = parseFrontmatter(content)

      const engine = mergeEngine(familyDefaults, meta.engine)
      if (!engine || !engine.topology) {
        skipped++
        continue
      }

      const layout = produceLayout(engine)
      if (!layout) {
        skipped++
        continue
      }

      try {
        const svg = renderToSvg(layout, engine, meta.title || slug)
        if (!svg) {
          skipped++
          continue
        }

        const filename = `${slug}-board.svg`
        const outPath = resolve(diagramDir, filename)

        if (dryRun) {
          console.log(`[dry-run] ${family}/${filename} (${svg.length} bytes)`)
        } else {
          mkdirSync(diagramDir, { recursive: true })
          writeFileSync(outPath, svg)
          console.log(`  ✓ ${family}/diagrams/svg/${filename}`)
        }
        generated++
      } catch (err) {
        console.error(`  ✗ ${family}/${slug}: ${err.message}`)
        errors++
      }
    }
  }

  console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${errors} errors`)
}

function mergeEngine(familyDefaults, variantEngine) {
  if (!familyDefaults && !variantEngine) return null
  if (!familyDefaults) return variantEngine
  if (!variantEngine) return familyDefaults

  const merged = { ...familyDefaults, ...variantEngine }
  if (familyDefaults.topology && variantEngine.topology) {
    merged.topology = { ...familyDefaults.topology, ...variantEngine.topology }
  }
  if (familyDefaults.render && variantEngine.render) {
    merged.render = { ...familyDefaults.render, ...variantEngine.render }
  }
  return merged
}

function renderToSvg(layout, engine, title) {
  const config = layout.config
  let rendered

  switch (layout.type) {
    case 'grid': {
      const grid = createGridTopology({ rows: layout.rows, cols: layout.cols })
      rendered = grid.renderLayout(config)
      break
    }
    case 'hex': {
      const hexConfig = {}
      if (layout.shape === 'hexagonal') hexConfig.radius = layout.params?.radius || 5
      else if (layout.shape === 'rhombus') hexConfig.size = layout.params?.rows || 11
      else if (layout.shape === 'triangular') hexConfig.radius = layout.params?.sideLength || 12
      hexConfig.shape = layout.shape || 'hexagonal'
      hexConfig.orientation = config.orientation || 'pointy'
      const hex = createHexTopology(hexConfig)
      rendered = hex.renderLayout(config)
      break
    }
    case 'pit': {
      const pit = createPitTopology({
        pitsPerSide: layout.cols || 6,
        hasStores: layout.stores !== false,
      })
      rendered = pit.renderLayout(config)
      break
    }
    case 'graph': {
      const graph = createGraphTopology({ nodes: ['_'], edges: [] })
      rendered = graph.renderLayout(config)
      break
    }
    case 'track': {
      const track = createTrackTopology({ positions: engine.topology?.positions || 24 })
      rendered = track.renderLayout(config)
      break
    }
    default:
      return null
  }

  if (!rendered || !rendered.elements) return null

  // Parse setup and add pieces if available
  const pieces = engine.setup ? parseSetupToPieces(engine.setup, layout.type) : null
  const pieceImages = resolvePieceImages(engine)

  return serializeLayout(rendered, {
    title,
    pieces: pieces && pieceImages ? pieces : null,
    pieceImages,
    tileSize: config.tileSize || rendered.tileSize || 40,
  })
}

function parseSetupToPieces(setup, topoType) {
  if (!setup || setup === '') return null
  if (typeof setup !== 'string') return null
  if (Array.isArray(setup)) return null

  if (topoType === 'grid') {
    return parseFenToPosition(setup)
  }
  if (topoType === 'hex') {
    return parseHexSetup(setup)
  }
  return null
}

function parseFenToPosition(fen) {
  const positionPart = fen.split(' ')[0]
  const ranks = positionPart.split('/')
  const position = {}
  for (let r = 0; r < ranks.length; r++) {
    let c = 0
    let i = 0
    while (i < ranks[r].length) {
      const ch = ranks[r][i]
      if (ch >= '1' && ch <= '9') {
        const next = ranks[r][i + 1]
        if (next >= '0' && next <= '9') {
          c += parseInt(ch + next)
          i += 2
        } else {
          c += parseInt(ch)
          i++
        }
      } else {
        const col = String.fromCharCode(97 + c)
        const row = ranks.length - r
        position[`${col}${row}`] = { type: ch }
        c++
        i++
      }
    }
  }
  return position
}

function parseHexSetup(setup) {
  if (!setup.includes(':')) return null
  const position = {}
  for (const pair of setup.split(',')) {
    const colonIdx = pair.lastIndexOf(':')
    if (colonIdx < 0) continue
    const coord = pair.substring(0, colonIdx)
    const piece = pair.substring(colonIdx + 1)
    position[coord] = { type: piece }
  }
  return position
}

function resolvePieceImages(engine) {
  if (!engine.pieces?.set) return null
  const setName = engine.pieces.set
  const galleryPath = resolve(ENGINE_ROOT, 'pieces/sets', setName, 'manifest.json')
  if (!existsSync(galleryPath)) return null

  try {
    const manifest = JSON.parse(readFileSync(galleryPath, 'utf8'))
    const images = {}
    const setDir = resolve(ENGINE_ROOT, 'pieces/sets', setName)
    for (const [key, file] of Object.entries(manifest.pieces || {})) {
      images[key] = resolve(setDir, file)
    }
    return images
  } catch {
    return null
  }
}

main()
