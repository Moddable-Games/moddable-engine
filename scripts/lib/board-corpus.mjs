// Shared corpus walk, path resolution and SVG helpers for the board scripts.
//
// Consumers: scripts/export-boards.mjs, scripts/snapshot-boards.mjs,
// scripts/compare-engine.mjs, scripts/build-board-index.mjs
//
// Before this module existed the same preamble was pasted into all four, and
// they drifted: compare-engine walked only content/variants/ while the other
// two also walked content/games/<dir>/, so its "no differences" verdict
// covered a fraction of the corpus. Omitting the second location
// is the drift this module exists to prevent.
//
// Import ./dom-stubs.mjs before this module in any script that renders.

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { parseFrontmatter } from '../../packages/schema/src/parse-frontmatter.js'
import { FEN4_OWNERS, recolourSvgText } from '../../packages/render/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const ENGINE_ROOT = resolve(__dirname, '../..')
export const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
export const GAMES_DIR = resolve(RULES_ROOT, 'games')
export const SNAP_DIR = resolve(ENGINE_ROOT, 'snapshots')
export const SVG_DIR = resolve(ENGINE_ROOT, 'boards', 'svgs')

// Topology aliases that render through the same pipeline.
export const TYPE_NORMALIZE = { hexagonal: 'hex', triangular: 'hex' }

export function loadGallery() {
  return JSON.parse(readFileSync(resolve(ENGINE_ROOT, 'pieces/gallery-index.json'), 'utf8'))
}

// Flags shared by every board script. Scripts add their own on top.
export function parseArgs(argv = process.argv.slice(2)) {
  return {
    args: argv,
    verbose: argv.includes('--verbose'),
    check: argv.includes('--check'),
    familyFilter: argv.filter(a => !a.startsWith('--'))[0] || null,
    has: flag => argv.includes(flag),
  }
}

export function listFamilies(familyFilter = null) {
  return readdirSync(GAMES_DIR).filter(f => {
    if (familyFilter && !f.includes(familyFilter)) return false
    return existsSync(resolve(GAMES_DIR, f, 'content'))
  })
}

export function familyEngineFor(family) {
  const rbPath = resolve(GAMES_DIR, family, 'content', 'rulebook.md')
  if (!existsSync(rbPath)) return null
  const { meta } = parseFrontmatter(readFileSync(rbPath, 'utf8'))
  return meta.engine || null
}

// Every board file a family owns, from both locations the corpus uses:
// content/variants/<slug>.md, and content/games/<dir>/*.md where a directory
// holds a standard.md plus optional alternates. Omitting the second location
// is the drift this module exists to prevent.
export function listVariantFiles(family) {
  const varDir = resolve(GAMES_DIR, family, 'content', 'variants')
  const gamesDir = resolve(GAMES_DIR, family, 'content', 'games')
  const files = []

  if (existsSync(varDir)) {
    for (const file of readdirSync(varDir).filter(f => f.endsWith('.md'))) {
      files.push({ slug: basename(file, '.md'), path: resolve(varDir, file) })
    }
  }

  if (existsSync(gamesDir)) {
    for (const gameDir of readdirSync(gamesDir)) {
      const dirPath = resolve(gamesDir, gameDir)
      const stdPath = resolve(dirPath, 'standard.md')
      if (existsSync(stdPath)) files.push({ slug: gameDir, path: stdPath })
      if (existsSync(dirPath)) {
        for (const alt of readdirSync(dirPath).filter(f => f.endsWith('.md') && f !== 'standard.md')) {
          files.push({ slug: `${gameDir}-${basename(alt, '.md')}`, path: resolve(dirPath, alt) })
        }
      }
    }
  }
  return files
}

// The whole corpus as one flat sequence. Yields the family engine block
// alongside each variant so callers do not re-read the rulebook per file.
export function* walkCorpus({ familyFilter = null } = {}) {
  for (const family of listFamilies(familyFilter)) {
    const familyEngine = familyEngineFor(family)
    const files = listVariantFiles(family)
    if (files.length === 0) continue
    for (const { slug, path } of files) {
      const { meta } = parseFrontmatter(readFileSync(path, 'utf8'))
      yield { family, familyEngine, slug, path, meta, engine: meta.engine || null }
    }
  }
}

// Inkscape and Sodipodi leave editor metadata in exported SVGs. Removing it is
// cosmetic, but it must be removed identically everywhere or two scripts
// produce different bytes for the same board and a snapshot diff lies.
export function stripSvgBloat(svgContent) {
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

export function embedPieceImages(svg, setDef) {
  const imagePattern = /<image\s+href="([^"]+)"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"[^/>]*\/>/g
  const owners = setDef?.owners || null
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
        inner = recolourSvgText(inner, setDef.recolourMatch || '#fff', owners[ownerName].fill)
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
