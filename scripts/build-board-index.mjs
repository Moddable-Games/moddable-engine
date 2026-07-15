#!/usr/bin/env node
/**
 * Build board gallery — produces self-contained SVGs + index.
 *
 * Reads snapshots/, embeds external piece image references as inline <symbol>,
 * writes to boards/svgs/, and generates boards/board-index.json.
 *
 * Usage: node scripts/build-board-index.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')
const SNAP_DIR = resolve(ENGINE_ROOT, 'snapshots')
const SVG_DIR = resolve(ENGINE_ROOT, 'boards', 'svgs')

import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'

mkdirSync(SVG_DIR, { recursive: true })

const gallery = JSON.parse(readFileSync(resolve(ENGINE_ROOT, 'pieces/gallery-index.json'), 'utf8'))
const entries = []
let embedded = 0

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
