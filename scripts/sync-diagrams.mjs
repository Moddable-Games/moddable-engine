#!/usr/bin/env node
/**
 * Sync diagrams between moddable-engine and moddable-rules.
 *
 * Tracks a manifest of exported diagrams. On each run:
 * 1. Scans moddable-rules frontmatter
 * 2. Hashes the engine block that would produce each diagram
 * 3. Compares against manifest → reports stale/missing/new
 * 4. With --export: regenerates stale SVGs and updates manifest
 *
 * Usage:
 *   node scripts/sync-diagrams.mjs              # report what's stale
 *   node scripts/sync-diagrams.mjs --export     # regenerate stale + update manifest
 *   node scripts/sync-diagrams.mjs --export go  # single family
 *   node scripts/sync-diagrams.mjs --force      # regenerate everything
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = resolve(ENGINE_ROOT, '../moddable-rules')
const MANIFEST_PATH = resolve(RULES_ROOT, 'diagrams-manifest.json')

import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { produceLayout } from '../packages/schema/src/produce-layout.js'
import { createGridTopology } from '../packages/topology-grid/src/topology-grid.js'
import { createHexTopology } from '../packages/topology-hex/src/topology-hex.js'
import { createPitTopology } from '../packages/topology-pit/src/topology-pit.js'
import { createGraphTopology } from '../packages/topology-graph/src/topology-graph.js'
import { createTrackTopology } from '../packages/topology-track/src/topology-track.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

const args = process.argv.slice(2)
const doExport = args.includes('--export')
const force = args.includes('--force')
const filterArgs = args.filter(a => !a.startsWith('--'))
const familyFilter = filterArgs[0] || null

const GAMES_DIR = resolve(RULES_ROOT, 'games')

function hash(str) {
  return createHash('md5').update(str).digest('hex').slice(0, 12)
}

function main() {
  if (!existsSync(GAMES_DIR)) {
    console.error(`moddable-rules not found at ${RULES_ROOT}`)
    process.exit(1)
  }

  const manifest = loadManifest()
  const current = scanFrontmatter()
  const { stale, missing, unchanged, removed } = diff(manifest, current)

  console.log(`Diagrams: ${current.size} expressible, ${unchanged.length} up-to-date, ${stale.length} stale, ${missing.length} missing`)
  if (removed.length) console.log(`  ${removed.length} in manifest but no longer in frontmatter (will be removed from manifest)`)

  if (stale.length) {
    console.log(`\nStale (frontmatter changed since last export):`)
    const byFamily = groupByFamily(stale)
    for (const [family, items] of Object.entries(byFamily)) {
      console.log(`  ${family}: ${items.map(i => i.slug).join(', ')}`)
    }
  }

  if (missing.length) {
    console.log(`\nMissing (never exported):`)
    const byFamily = groupByFamily(missing)
    for (const [family, items] of Object.entries(byFamily)) {
      console.log(`  ${family}: ${items.map(i => i.slug).join(', ')}`)
    }
  }

  if (!doExport && !force) {
    if (stale.length + missing.length > 0) {
      console.log(`\nRun with --export to regenerate ${stale.length + missing.length} diagrams`)
    }
    return
  }

  const toExport = force ? [...current.values()] : [...stale, ...missing]
  if (familyFilter) {
    const filtered = toExport.filter(e => e.family.includes(familyFilter))
    exportDiagrams(filtered, manifest, current)
  } else {
    exportDiagrams(toExport, manifest, current)
  }

  for (const key of removed) manifest.delete(key)
  saveManifest(manifest)
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return new Map()
  try {
    const data = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    return new Map(Object.entries(data))
  } catch {
    return new Map()
  }
}

function saveManifest(manifest) {
  const obj = Object.fromEntries([...manifest.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  writeFileSync(MANIFEST_PATH, JSON.stringify(obj, null, 2) + '\n')
  console.log(`\nManifest updated (${manifest.size} entries)`)
}

function scanFrontmatter() {
  const entries = new Map()
  const families = readdirSync(GAMES_DIR).filter(f => {
    const contentDir = resolve(GAMES_DIR, f, 'content')
    return existsSync(contentDir)
  })

  for (const family of families) {
    const familyDir = resolve(GAMES_DIR, family, 'content')
    const variantsDir = resolve(familyDir, 'variants')

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
      const content = readFileSync(resolve(variantsDir, file), 'utf8')
      const { meta } = parseFrontmatter(content)

      const engine = mergeEngine(familyDefaults, meta.engine)
      if (!engine || !engine.topology) continue

      const layout = produceLayout(engine)
      if (!layout) continue

      const key = `${family}/${slug}`
      const engineStr = JSON.stringify({ topology: engine.topology, surface: engine.surface, render: engine.render, setup: engine.setup })
      entries.set(key, {
        family,
        slug,
        hash: hash(engineStr),
        engine,
        layout,
        title: meta.title || slug,
      })
    }
  }

  return entries
}

function diff(manifest, current) {
  const stale = []
  const missing = []
  const unchanged = []
  const removed = []

  for (const [key, entry] of current) {
    const prev = manifest.get(key)
    if (!prev) {
      missing.push(entry)
    } else if (prev !== entry.hash) {
      stale.push(entry)
    } else {
      unchanged.push(entry)
    }
  }

  for (const key of manifest.keys()) {
    if (!current.has(key)) removed.push(key)
  }

  return { stale, missing, unchanged, removed }
}

function groupByFamily(entries) {
  const groups = {}
  for (const e of entries) {
    if (!groups[e.family]) groups[e.family] = []
    groups[e.family].push(e)
  }
  return groups
}

function exportDiagrams(entries, manifest, current) {
  let generated = 0, errors = 0

  for (const entry of entries) {
    const diagramDir = resolve(GAMES_DIR, entry.family, 'diagrams', 'svg')
    try {
      const svg = renderToSvg(entry.layout, entry.engine, entry.title)
      if (!svg) continue

      const filename = `${entry.slug}-board.svg`
      mkdirSync(diagramDir, { recursive: true })
      writeFileSync(resolve(diagramDir, filename), svg)

      const key = `${entry.family}/${entry.slug}`
      manifest.set(key, entry.hash)
      generated++
    } catch (err) {
      console.error(`  ✗ ${entry.family}/${entry.slug}: ${err.message}`)
      errors++
    }
  }

  console.log(`\nExported: ${generated} generated, ${errors} errors`)
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

  const pieces = engine.setup ? parseSetupToPieces(engine.setup, layout.type) : null
  const pieceImages = resolvePieceImages(engine)

  const tileSize = config.tileSize || rendered.tileSize || 40

  if (pieces && pieceImages) {
    return serializeWithDefs(rendered, { title, pieces, pieceImages, tileSize })
  }

  return serializeLayout(rendered, { title, pieces: null, pieceImages: null, tileSize })
}

function serializeWithDefs(layout, opts) {
  const { title, pieces, pieceImages, tileSize } = opts
  const { width, height, elements, cells, labels, defs: layoutDefs } = layout

  const usedPieceTypes = new Set()
  for (const cell of cells) {
    const piece = pieces[cell.id]
    if (!piece) continue
    const key = typeof piece === 'string' ? piece : piece.type
    if (pieceImages[key]) usedPieceTypes.add(key)
  }

  const pieceDefs = []
  for (const key of usedPieceTypes) {
    const filePath = pieceImages[key]
    if (!existsSync(filePath)) continue
    let content = readFileSync(filePath, 'utf8')
    content = content.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/, '').trim()
    const viewBox = content.match(/viewBox="([^"]+)"/)
    const vb = viewBox ? viewBox[1] : '0 0 45 45'
    const inner = content.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '').trim()
    pieceDefs.push(`<symbol id="piece-${key}" viewBox="${vb}">${inner}</symbol>`)
  }

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`)
  if (title) parts.push(`<title>${esc(title)}</title>`)

  if (pieceDefs.length || (layoutDefs && layoutDefs.length)) {
    parts.push('<defs>')
    if (layoutDefs) for (const d of layoutDefs) parts.push(elementToSvg(d))
    for (const def of pieceDefs) parts.push(def)
    parts.push('</defs>')
  }

  for (const el of elements) parts.push(elementToSvg(el))
  for (const cell of cells) parts.push(elementToSvg(cell.element))

  const pieceUses = []
  for (const cell of cells) {
    const piece = pieces[cell.id]
    if (!piece) continue
    const key = typeof piece === 'string' ? piece : piece.type
    if (!usedPieceTypes.has(key)) continue
    const size = tileSize
    pieceUses.push(`<use href="#piece-${key}" x="${cell.x - size / 2}" y="${cell.y - size / 2}" width="${size}" height="${size}"/>`)
  }
  if (pieceUses.length) {
    parts.push('<g pointer-events="none">')
    for (const u of pieceUses) parts.push(u)
    parts.push('</g>')
  }

  for (const lbl of labels) parts.push(elementToSvg(lbl))
  parts.push('</svg>')
  return parts.join('\n')
}

function elementToSvg(el) {
  if (!el || !el.tag) return ''
  const { tag, attrs = {}, text, children } = el
  const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ')
  if (text != null) return `<${tag}${attrStr ? ' ' + attrStr : ''}>${esc(String(text))}</${tag}>`
  if (children && children.length) {
    const inner = children.map(c => elementToSvg(c)).join('')
    return `<${tag}${attrStr ? ' ' + attrStr : ''}>${inner}</${tag}>`
  }
  return `<${tag}${attrStr ? ' ' + attrStr : ''}/>`
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parseSetupToPieces(setup, topoType) {
  if (!setup || setup === '') return null
  if (typeof setup !== 'string') return null
  if (Array.isArray(setup)) return null
  if (topoType === 'grid') return parseFenToPosition(setup)
  if (topoType === 'hex') return parseHexSetup(setup)
  return null
}

function parseFenToPosition(fen) {
  const positionPart = fen.split(' ')[0]
  const ranks = positionPart.split('/')
  const position = {}
  for (let r = 0; r < ranks.length; r++) {
    let c = 0, i = 0
    while (i < ranks[r].length) {
      const ch = ranks[r][i]
      if (ch >= '1' && ch <= '9') {
        const next = ranks[r][i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(ch + next); i += 2 }
        else { c += parseInt(ch); i++ }
      } else {
        const col = String.fromCharCode(97 + c)
        const row = ranks.length - r
        position[`${col}${row}`] = { type: ch }
        c++; i++
      }
    }
  }
  return position
}

function parseHexSetup(setup) {
  if (!setup.includes(':')) return null
  const position = {}
  const entries = setup.match(/-?\d+,-?\d+:[A-Za-z]+/g)
  if (!entries) return null
  for (const entry of entries) {
    const colonIdx = entry.lastIndexOf(':')
    const coord = entry.substring(0, colonIdx)
    const piece = entry.substring(colonIdx + 1)
    position[coord] = { type: piece }
  }
  return position
}

function resolvePieceImages(engine) {
  if (!engine.pieces?.set) return null
  const setName = engine.pieces.set
  return loadPieceSet(setName)
}

function loadPieceSet(setName) {
  const setDir = resolve(ENGINE_ROOT, 'pieces/sets', setName)
  const manifestPath = resolve(setDir, 'manifest.json')
  if (!existsSync(manifestPath)) return null

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const images = {}

    if (manifest.extends) {
      const base = loadPieceSet(manifest.extends)
      if (base) Object.assign(images, base)
    }

    for (const [key, entry] of Object.entries(manifest.pieces || {})) {
      if (typeof entry === 'string') {
        images[key] = resolve(setDir, entry)
      } else if (entry && entry.file) {
        if (entry.source) {
          const sourceDir = resolve(setDir, manifest.sources?.[entry.source] || `../${entry.source}`)
          images[key] = resolve(sourceDir, entry.file)
        } else {
          images[key] = resolve(setDir, entry.file)
        }
      }
    }

    // FEN character mapping: uppercase = white piece, lowercase = black
    // Map single FEN chars to their piece image keys
    const fenMap = {}
    for (const key of Object.keys(images)) {
      if (key.length === 2 && (key[0] === 'w' || key[0] === 'b')) {
        const fenChar = key[0] === 'w' ? key[1].toUpperCase() : key[1].toLowerCase()
        if (!images[fenChar]) fenMap[fenChar] = images[key]
      }
    }
    Object.assign(images, fenMap)

    return Object.keys(images).length > 0 ? images : null
  } catch { return null }
}

main()
