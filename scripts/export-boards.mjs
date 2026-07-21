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

// DOM stubs for boards.js module-level references
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
  const gamesDir = resolve(GAMES_DIR, family, 'content', 'games')

  const variantFiles = []
  if (existsSync(varDir)) {
    for (const file of readdirSync(varDir).filter(f => f.endsWith('.md'))) {
      variantFiles.push({ slug: basename(file, '.md'), path: resolve(varDir, file) })
    }
  }
  if (existsSync(gamesDir)) {
    for (const gameDir of readdirSync(gamesDir)) {
      const stdPath = resolve(gamesDir, gameDir, 'standard.md')
      if (existsSync(stdPath)) variantFiles.push({ slug: gameDir, path: stdPath })
      const dirPath = resolve(gamesDir, gameDir)
      if (existsSync(dirPath)) {
        for (const alt of readdirSync(dirPath).filter(f => f.endsWith('.md') && f !== 'standard.md')) {
          variantFiles.push({ slug: `${gameDir}-${basename(alt, '.md')}`, path: resolve(dirPath, alt) })
        }
      }
    }
  }
  if (variantFiles.length === 0) continue

  for (const { slug, path: variantPath } of variantFiles) {
    const { meta } = parseFrontmatter(readFileSync(variantPath, 'utf8'))
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

      const pieceResult = attachPieceImages(resolved, gallery)
      const rawSvg = renderFromEngine(resolved, {
        pieceImages: pieceResult.images || {},
        pieceSurfaceMap: pieceResult.surfaceMap || {},
        pieceSurface: pieceResult.surface || null,
      })
      if (!rawSvg) { skipped++; continue }

      // Embed external piece images inline so SVGs are self-contained
      const pieceSetId = resolved.pieces?.set
      const setDef = pieceSetId ? gallery.find(s => s.id === pieceSetId) : null
      const svg = embedPieceImages(rawSvg, setDef)

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

function stripSvgBloat(svgContent) {
  let s = svgContent
  // Remove Inkscape/Sodipodi metadata elements
  s = s.replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
  s = s.replace(/<sodipodi:[^>]*\/>/gi, '')
  s = s.replace(/<sodipodi:[^>]*>[\s\S]*?<\/sodipodi:[^>]*>/gi, '')
  // Remove RDF
  s = s.replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/gi, '')
  // Remove Inkscape named views
  s = s.replace(/<inkscape:[^>]*\/>/gi, '')
  s = s.replace(/<inkscape:[^>]*>[\s\S]*?<\/inkscape:[^>]*>/gi, '')
  // Remove XML comments
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  // Remove Inkscape/Sodipodi attributes from remaining elements
  s = s.replace(/\s+(inkscape|sodipodi):[a-z-]+="[^"]*"/gi, '')
  // Remove -inkscape-font-specification from style attributes
  s = s.replace(/-inkscape-font-specification:[^;"]+(;|(?="))/g, '')
  // Remove empty defs
  s = s.replace(/<defs[^>]*>\s*<\/defs>/gi, '')
  // Remove empty id attributes on anonymous groups
  s = s.replace(/\s+id="(defs|metadata|layer)\d*"/gi, '')
  // Collapse multiple whitespace
  s = s.replace(/\n\s*\n/g, '\n')
  return s.trim()
}

function embedPieceImages(svg, setDef) {
  const imagePattern = /<image\s+href="([^"]+)"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"[^/>]*\/>/g
  const owners = setDef?.owners || null
  const FEN4_OWNERS = { r: 'red', b: 'blue', y: 'yellow', g: 'green' }
  const hrefToSymbol = new Map()

  let match
  while ((match = imagePattern.exec(svg)) !== null) {
    const href = match[1]
    if (!hrefToSymbol.has(href)) {
      const cleanHref = href.split('#')[0]
      const fragment = href.includes('#') ? href.split('#')[1] : null
      const parts = cleanHref.split('/')
      const filename = parts[parts.length - 1].replace('.svg', '')
      const setName = parts.length >= 2 ? parts[parts.length - 2] : 'unknown'
      const symbolId = fragment ? `piece-${setName}-${fragment}` : `piece-${setName}-${filename}`
      hrefToSymbol.set(href, symbolId)
    }
  }

  if (hrefToSymbol.size === 0) return svg

  const defs = []
  const fileCache = new Map()
  for (const [href, symbolId] of hrefToSymbol) {
    const cleanHref = href.split('#')[0]
    const fragment = href.includes('#') ? href.split('#')[1] : null
    const filePath = cleanHref.startsWith('../pieces/')
      ? resolve(ENGINE_ROOT, cleanHref.replace('../', ''))
      : cleanHref.startsWith('pieces/')
        ? resolve(ENGINE_ROOT, cleanHref)
        : null
    if (!filePath || !existsSync(filePath)) continue

    let content = fileCache.get(filePath)
    if (!content) {
      content = readFileSync(filePath, 'utf8')
      content = content.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/, '').trim()
      content = content.replace(/xlink:href/g, 'href')
      fileCache.set(filePath, content)
    }
    const svgTag = content.match(/<svg[^>]*>/)?.[0] || ''
    const vbMatch = svgTag.match(/viewBox="([^"]+)"/)
    let vb
    if (vbMatch) {
      vb = vbMatch[1]
    } else {
      const w = svgTag.match(/width="([\d.]+)"/)
      const h = svgTag.match(/height="([\d.]+)"/)
      vb = `0 0 ${w ? Math.round(parseFloat(w[1])) : '45'} ${h ? Math.round(parseFloat(h[1])) : '45'}`
    }
    let inner = content.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
    inner = stripSvgBloat(inner)

    // Apply owner recolouring for virtual sets (4-player chess etc.)
    if (owners && fragment) {
      const prefix = fragment[0]
      const ownerName = FEN4_OWNERS[prefix]
      if (ownerName && owners[ownerName]) {
        const fill = owners[ownerName].fill
        inner = inner.replace(/fill:#fff\b/gi, `fill:${fill}`)
        inner = inner.replace(/fill:\s*#ffffff\b/gi, `fill:${fill}`)
        inner = inner.replace(/fill="white"/gi, `fill="${fill}"`)
        inner = inner.replace(/fill="#fff"/gi, `fill="${fill}"`)
        inner = inner.replace(/fill="#ffffff"/gi, `fill="${fill}"`)
        inner = inner.replace(/fill="#f5deb3"/gi, `fill="${fill}"`)
      }
    }

    defs.push(`<symbol id="${symbolId}" viewBox="${vb}">${inner}</symbol>`)
  }

  if (defs.length === 0) return svg

  let result = svg.replace(imagePattern, (full, href, x, y, w, h) => {
    const symbolId = hrefToSymbol.get(href)
    if (!symbolId) return full
    return `<use href="#${symbolId}" x="${x}" y="${y}" width="${w}" height="${h}"/>`
  })

  const existingDefs = result.indexOf('<defs>')
  if (existingDefs !== -1) {
    result = result.replace('<defs>', `<defs>\n${defs.join('\n')}`)
  } else {
    const svgOpen = result.indexOf('>') + 1
    result = result.slice(0, svgOpen) + `\n<defs>\n${defs.join('\n')}\n</defs>` + result.slice(svgOpen)
  }

  return result
}
