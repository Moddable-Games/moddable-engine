#!/usr/bin/env node
/**
 * Export board diagrams using the GAMES object (studio rendering path).
 *
 * This renders via reverseAdapt → cascade → renderBoard — the same pipeline
 * the board studio uses in Schema mode. Output is pixel-identical to studio.
 *
 * Usage:
 *   node scripts/export-boards.mjs                  # report count
 *   node scripts/export-boards.mjs --export         # generate all
 *   node scripts/export-boards.mjs --export chess   # single family
 *   node scripts/export-boards.mjs --export --verbose
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

// DOM stubs (boards.js has some browser-API references at module level)
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
const verbose = args.includes('--verbose')
const familyFilter = args.filter(a => !a.startsWith('--'))[0] || null

if (!existsSync(GAMES_DIR)) {
  console.error(`moddable-rules not found at ${RULES_ROOT}`)
  process.exit(1)
}

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

      const rawSvg = renderBoard(opts)
      if (!rawSvg) { skipped++; continue }

      const svg = embedPieceImages(rawSvg)

      const diagramDir = resolve(GAMES_DIR, gameId, 'diagrams', 'svg')
      mkdirSync(diagramDir, { recursive: true })
      writeFileSync(resolve(diagramDir, `${varId}-board.svg`), svg)
      exported++
      if (verbose) console.log(`  ✓ ${gameId}/${varId}`)
    } catch (e) {
      console.error(`  ✗ ${gameId}/${varId}: ${e.message}`)
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
  s = s.replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
  s = s.replace(/<sodipodi:[^>]*\/>/gi, '')
  s = s.replace(/<sodipodi:[^>]*>[\s\S]*?<\/sodipodi:[^>]*>/gi, '')
  s = s.replace(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/gi, '')
  s = s.replace(/<inkscape:[^>]*\/>/gi, '')
  s = s.replace(/<inkscape:[^>]*>[\s\S]*?<\/inkscape:[^>]*>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/\s+(inkscape|sodipodi):[a-z-]+="[^"]*"/gi, '')
  s = s.replace(/-inkscape-font-specification:[^;"]+(;|(?="))/g, '')
  s = s.replace(/<defs[^>]*>\s*<\/defs>/gi, '')
  s = s.replace(/\s+id="(defs|metadata|layer)\d*"/gi, '')
  s = s.replace(/\n\s*\n/g, '\n')
  return s.trim()
}

function embedPieceImages(svg) {
  const imagePattern = /<image\s+href="([^"]+)"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"[^/>]*\/>/g
  const usedPaths = new Map()

  let match
  while ((match = imagePattern.exec(svg)) !== null) {
    const href = match[1]
    if (!usedPaths.has(href)) {
      const parts = href.split('/')
      const filename = parts[parts.length - 1].replace('.svg', '')
      const setName = parts.length >= 2 ? parts[parts.length - 2] : 'unknown'
      usedPaths.set(href, `piece-${setName}-${filename}`)
    }
  }

  if (usedPaths.size === 0) return svg

  const defs = []
  for (const [href, symbolId] of usedPaths) {
    const filePath = href.startsWith('../pieces/')
      ? resolve(ENGINE_ROOT, href.replace('../', ''))
      : href.startsWith('pieces/')
        ? resolve(ENGINE_ROOT, href)
        : null
    if (!filePath || !existsSync(filePath)) continue

    let content = readFileSync(filePath, 'utf8')
    content = content.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/, '').trim()
    content = content.replace(/xlink:href/g, 'href')
    const vbMatch = content.match(/viewBox="([^"]+)"/)
    let vb
    if (vbMatch) {
      vb = vbMatch[1]
    } else {
      const w = content.match(/width="(\d+)"/)
      const h = content.match(/height="(\d+)"/)
      vb = `0 0 ${w ? w[1] : '45'} ${h ? h[1] : '45'}`
    }
    let inner = content.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
    inner = stripSvgBloat(inner)
    defs.push(`<symbol id="${symbolId}" viewBox="${vb}">${inner}</symbol>`)
  }

  if (defs.length === 0) return svg

  let result = svg.replace(imagePattern, (full, href, x, y, w, h) => {
    const symbolId = usedPaths.get(href)
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
