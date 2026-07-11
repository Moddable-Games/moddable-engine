#!/usr/bin/env node
/**
 * Export board diagrams using the REAL studio rendering pipeline.
 *
 * Uses the same code path as boards/index.html "Schema" mode:
 * frontmatter → cascade-resolver → render-adapter → board-diagrams.js
 *
 * Produces self-contained SVGs with embedded piece definitions.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const MANIFEST_PATH = resolve(RULES_ROOT, 'diagrams-manifest.json')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

// Studio pipeline imports
import { resolveSurface } from '../js/surface-resolver.js'
import { resolve as cascadeResolve } from '../js/cascade-resolver.js'
import { buildRenderOpts, attachPieceImages, buildPieceImages, renderDeckFromResolved, mapColorsForProvider } from '../js/render-adapter.js'
import { renderBoard, fenToPosition } from '../js/board-diagrams.js'

// Schema parser (for reading frontmatter from disk)
import { parseFrontmatter as schemaParser } from '../packages/schema/src/parse-frontmatter.js'

const args = process.argv.slice(2)
const doExport = args.includes('--export')
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose')
const filterArgs = args.filter(a => !a.startsWith('--'))
const familyFilter = filterArgs[0] || null
const variantFilter = filterArgs[1] || null

// Load gallery index once
const galleryPath = resolve(ENGINE_ROOT, 'pieces/gallery-index.json')
const gallery = existsSync(galleryPath) ? JSON.parse(readFileSync(galleryPath, 'utf8')) : []


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

  if (dryRun) {
    console.log(`Found ${current.size} exportable variants`)
    for (const [key, entry] of current) {
      console.log(`  ${key} → ${entry.boardStyle || '?'}`)
    }
    return
  }

  const { stale, missing, unchanged, removed } = diff(manifest, current)
  console.log(`Diagrams: ${current.size} expressible, ${unchanged.length} up-to-date, ${stale.length} stale, ${missing.length} missing`)
  if (removed.length) console.log(`  ${removed.length} removed from frontmatter`)

  if (!doExport && !force) {
    if (stale.length) {
      console.log(`\nStale:`)
      for (const e of stale) console.log(`  ${e.family}/${e.slug}`)
    }
    if (missing.length) {
      console.log(`\nMissing:`)
      for (const e of missing) console.log(`  ${e.family}/${e.slug}`)
    }
    if (stale.length + missing.length > 0) {
      console.log(`\nRun with --export to regenerate`)
    }
    return
  }

  const toExport = force ? [...current.values()] : [...stale, ...missing]
  let filtered = toExport
  if (familyFilter) filtered = toExport.filter(e => e.family.includes(familyFilter))
  if (variantFilter) filtered = filtered.filter(e => e.slug === variantFilter)

  let generated = 0, errors = 0

  for (const entry of filtered) {
    try {
      const svg = renderEntry(entry)
      if (!svg) { console.error(`  ✗ ${entry.family}/${entry.slug}: returned null (no renderable output)`); errors++; continue }

      const diagramDir = resolve(GAMES_DIR, entry.family, 'diagrams', 'svg')
      const filename = `${entry.slug}-board.svg`
      mkdirSync(diagramDir, { recursive: true })
      writeFileSync(resolve(diagramDir, filename), svg)
      manifest.set(`${entry.family}/${entry.slug}`, entry.hash)
      generated++
      if (verbose) console.log(`  ✓ ${entry.family}/${filename}`)
    } catch (err) {
      console.error(`  ✗ ${entry.family}/${entry.slug}: ${err.message}`)
      if (verbose) console.error(err.stack)
      errors++
    }
  }

  for (const key of removed) manifest.delete(key)
  saveManifest(manifest)
  console.log(`\nDone: ${generated} generated, ${errors} errors`)
}


function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return new Map()
  try {
    const data = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    return new Map(Object.entries(data))
  } catch { return new Map() }
}

function saveManifest(manifest) {
  const obj = Object.fromEntries([...manifest.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  writeFileSync(MANIFEST_PATH, JSON.stringify(obj, null, 2) + '\n')
  console.log(`Manifest updated (${manifest.size} entries)`)
}

function scanFrontmatter() {
  const entries = new Map()
  const families = readdirSync(GAMES_DIR).filter(f => {
    if (familyFilter && !f.includes(familyFilter)) return false
    const contentDir = resolve(GAMES_DIR, f, 'content')
    return existsSync(contentDir)
  })

  for (const family of families) {
    const familyDir = resolve(GAMES_DIR, family, 'content')
    const variantsDir = resolve(familyDir, 'variants')

    // Read family-level engine block from rulebook
    const rulebook = resolve(familyDir, 'rulebook.md')
    let familyEngine = null
    if (existsSync(rulebook)) {
      const { meta } = schemaParser(readFileSync(rulebook, 'utf8'))
      if (meta.engine) familyEngine = meta.engine
    }

    if (!existsSync(variantsDir)) continue
    const variantFiles = readdirSync(variantsDir).filter(f => f.endsWith('.md'))

    for (const file of variantFiles) {
      const slug = basename(file, '.md')
      if (variantFilter && slug !== variantFilter) continue

      const content = readFileSync(resolve(variantsDir, file), 'utf8')
      const { meta } = schemaParser(content)
      const variantEngine = meta.engine
      if (!variantEngine && !familyEngine) continue

      // Must have a topology to render
      const mergedTopo = variantEngine?.topology || familyEngine?.topology
      if (!mergedTopo?.type) continue

      // Hash the rendering-relevant fields
      const hashInput = JSON.stringify({
        familyEngine: familyEngine ? { topology: familyEngine.topology, surface: familyEngine.surface, render: familyEngine.render, pieces: familyEngine.pieces } : null,
        variantEngine: variantEngine ? { topology: variantEngine.topology, surface: variantEngine.surface, render: variantEngine.render, pieces: variantEngine.pieces, setup: variantEngine.setup, content: variantEngine.content } : null,
      })

      const key = `${family}/${slug}`
      entries.set(key, {
        family,
        slug,
        hash: hash(hashInput),
        familyEngine,
        variantEngine,
        title: meta.title || slug,
      })
    }
  }

  return entries
}


function diff(manifest, current) {
  const stale = [], missing = [], unchanged = [], removed = []
  for (const [key, entry] of current) {
    const prev = manifest.get(key)
    if (!prev) missing.push(entry)
    else if (prev !== entry.hash) stale.push(entry)
    else unchanged.push(entry)
  }
  for (const key of manifest.keys()) {
    if (!current.has(key)) removed.push(key)
  }
  return { stale, missing, unchanged, removed }
}

// Normalise non-standard topology type names to the ones our providers understand
function normaliseTopology(engine) {
  if (!engine?.topology?.type) return engine
  const typeMap = { hexagonal: 'hex', triangular: 'hex' }
  const normalised = typeMap[engine.topology.type]
  if (!normalised) return engine
  return { ...engine, topology: { ...engine.topology, type: normalised } }
}

function renderEntry(entry) {
  const { title } = entry
  const familyEngine = normaliseTopology(entry.familyEngine)
  const variantEngine = normaliseTopology(entry.variantEngine)

  // Build cascade input — same shape as the studio's renderSchemaMode
  const surfaceRef = variantEngine?.surface || familyEngine?.surface || null
  const surface = surfaceRef ? resolveSurface(surfaceRef) : {}

  const { resolved, errors } = cascadeResolve({
    surface,
    family: { engine: familyEngine || {}, meta: {} },
    variant: { engine: variantEngine || {}, meta: { label: title } },
  })

  if (errors.length > 0) {
    if (verbose) console.warn(`  warn ${entry.family}/${entry.slug}: ${errors.join('; ')}`)
    // Continue anyway — some errors are non-fatal
  }

  // Load content data if needed (landlords, etc.)
  if (resolved.content?.source) {
    const dataPath = resolve(ENGINE_ROOT, 'data', resolved.content.source)
    if (existsSync(dataPath)) {
      resolved.content.data = JSON.parse(readFileSync(dataPath, 'utf8'))
    }
  }

  // Multi-board games (Alice, Bughouse, etc.)
  const topo = resolved.topology || {}
  if (topo.layers && topo.layers > 1) {
    return renderMultiBoardEntry(resolved, entry)
  }

  // Deck/card games (no spatial board)
  if (topo.type === 'none' || !topo.type) {
    if (resolved.components?.deck || resolved.components?.dice) {
      return renderDeckFromResolved(resolved)
    }
    return null
  }

  // Normal board — the main path
  const opts = buildRenderOpts(resolved)
  if (!opts) return null

  // Attach piece images
  if (gallery.length > 0) {
    attachPieceImages(opts, resolved, gallery)
  }

  // Render using the real provider pipeline
  const svg = renderBoard(opts)
  if (!svg) return null

  // Post-process: embed piece SVGs inline instead of external href references
  return embedPieceImages(svg, opts.pieceImages)
}


function renderMultiBoardEntry(resolved, entry) {
  const topo = resolved.topology || {}
  const render = resolved.render || {}
  const count = topo.layers || 2
  const layout = render.layers?.layout || 'horizontal'
  const labels = topo.layer_labels || []
  const fens = Array.isArray(resolved.setup) ? resolved.setup : []
  const layerColors = render.layers?.colors || null

  const ts = render.cellSize || 34
  const rows = topo.rows || 8
  const cols = topo.cols || 8
  const boardW = cols * ts
  const boardH = rows * ts
  const gap = layout === 'horizontal' ? 20 : 12
  const labelH = 18
  const pad = 24

  let totalW, totalH
  if (layout === 'horizontal') {
    totalW = count * boardW + (count - 1) * gap + pad * 2
    totalH = boardH + pad * 2 + labelH
  } else {
    totalW = boardW + pad * 2
    totalH = count * (boardH + labelH) + (count - 1) * gap + pad * 2
  }

  // Resolve colors
  const surfaceRef = resolved.surface
  const baseColors = surfaceRef?.colors ? mapColorsForProvider('checkered', surfaceRef) : {}

  // Resolve piece images
  let pieceImages = null
  if (resolved.pieces?.set && gallery.length > 0) {
    const fenOverrides = resolved.pieces?.fenMap || null
    const { images } = buildPieceImages(resolved.pieces.set, gallery, fenOverrides, false)
    if (Object.keys(images).length > 0) pieceImages = images
  }

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`)
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="#1a1a2e" rx="6"/>`)

  for (let i = 0; i < count; i++) {
    let ox, oy
    if (layout === 'horizontal') {
      ox = pad + i * (boardW + gap)
      oy = pad + labelH
    } else {
      ox = pad
      oy = pad + i * (boardH + labelH + gap)
    }

    const labelX = ox + boardW / 2
    const labelY = oy - 4
    parts.push(`<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="#aaa" font-family="system-ui">${labels[i] || 'Board ' + (i + 1)}</text>`)

    const boardColors = layerColors && layerColors[i]
      ? { lightSquare: layerColors[i].lightSquare || '#f0d9b5', darkSquare: layerColors[i].darkSquare || '#b58863' }
      : baseColors
    const fen = fens[i]
    const position = fen ? fenToPosition(fen, rows, cols) : {}

    const layerOpts = {
      boardStyle: 'checkered',
      rows, cols, tileSize: ts,
      colors: boardColors,
      position,
      showLabels: false,
    }
    if (pieceImages) layerOpts.pieceImages = pieceImages

    const layerSvg = renderBoard(layerOpts)
    const innerStart = layerSvg.indexOf('>') + 1
    const innerEnd = layerSvg.lastIndexOf('</svg>')
    const innerContent = layerSvg.slice(innerStart, innerEnd)

    parts.push(`<g transform="translate(${ox},${oy})">`)
    parts.push(innerContent)
    parts.push('</g>')
  }

  parts.push('</svg>')
  const svg = parts.join('\n')
  return embedPieceImages(svg, pieceImages)
}

function embedPieceImages(svg, pieceImages) {
  if (!pieceImages) return svg

  // Find all <image href="..."> references and replace with <use href="#piece-xxx">
  const imagePattern = /<image\s+href="([^"]+)"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"[^/]*\/>/g
  const usedPaths = new Map() // path → symbolId

  // First pass: collect all referenced image paths
  let match
  const svgCopy = svg
  while ((match = imagePattern.exec(svgCopy)) !== null) {
    const href = match[1]
    if (!usedPaths.has(href)) {
      // Derive symbol ID from the filename
      const parts = href.split('/')
      const filename = parts[parts.length - 1].replace('.svg', '')
      const setName = parts.length >= 3 ? parts[parts.length - 2] : 'unknown'
      usedPaths.set(href, `piece-${setName}-${filename}`)
    }
  }

  if (usedPaths.size === 0) return svg

  // Build <defs> block with embedded SVG symbols
  const defs = []
  for (const [href, symbolId] of usedPaths) {
    const filePath = resolveImagePath(href)
    if (!filePath || !existsSync(filePath)) continue

    let content = readFileSync(filePath, 'utf8')
    content = content.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/, '').trim()

    const viewBox = content.match(/viewBox="([^"]+)"/)
    let vb
    if (viewBox) {
      vb = viewBox[1]
    } else {
      const w = content.match(/width="(\d+)"/)
      const h = content.match(/height="(\d+)"/)
      vb = `0 0 ${w ? w[1] : '45'} ${h ? h[1] : '45'}`
    }
    const inner = content.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
    defs.push(`<symbol id="${symbolId}" viewBox="${vb}">${inner}</symbol>`)
  }

  if (defs.length === 0) return svg

  // Replace <image> tags with <use> tags
  let result = svg.replace(imagePattern, (full, href, x, y, w, h) => {
    const symbolId = usedPaths.get(href)
    if (!symbolId) return full
    return `<use href="#${symbolId}" x="${x}" y="${y}" width="${w}" height="${h}"/>`
  })

  // Inject defs block after opening <svg> tag
  const svgOpen = result.indexOf('>') + 1
  const defsBlock = `\n<defs>\n${defs.join('\n')}\n</defs>`

  // Check if there's already a <defs> section
  const existingDefs = result.indexOf('<defs>')
  if (existingDefs !== -1) {
    // Insert symbols into existing defs
    result = result.replace('<defs>', `<defs>\n${defs.join('\n')}`)
  } else {
    result = result.slice(0, svgOpen) + defsBlock + result.slice(svgOpen)
  }

  return result
}

function resolveImagePath(href) {
  // href is relative like "../pieces/sets/chessnut/wK.svg"
  // Resolve against ENGINE_ROOT
  if (href.startsWith('../pieces/')) {
    return resolve(ENGINE_ROOT, href.replace('../', ''))
  }
  if (href.startsWith('pieces/')) {
    return resolve(ENGINE_ROOT, href)
  }
  return null
}

main()
