#!/usr/bin/env node
// CI guard: fail if known-consolidated patterns reappear as duplicates.
// Each check looks for a second definition of something that must be single-source.

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = import.meta.dirname ? resolve(import.meta.dirname, '..') : process.cwd()
const errors = []

function scanFiles(dir, ext = '.js') {
  const results = []
  if (!existsSync(dir)) return results
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(ext) || entry.name.endsWith('.mjs')) results.push(full)
    }
  }
  walk(dir)
  return results
}

const isMain = import.meta.dirname && process.argv[1]?.endsWith('check-duplication.mjs')

if (isMain) {

const sourceFiles = [
  ...scanFiles(resolve(ROOT, 'packages')),
  ...scanFiles(resolve(ROOT, 'js')),
  ...scanFiles(resolve(ROOT, 'scripts')),
]

// 1. FEN4_OWNERS must only be defined in packages/render/src/recolour.js
const fen4Defs = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('FEN4_OWNERS') && content.includes("r: 'red'") && !f.includes('recolour.js')
})
if (fen4Defs.length > 0) {
  errors.push(`FEN4_OWNERS defined outside recolour.js: ${fen4Defs.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 2. recolourMatch replacement must not use hardcoded colour regexes
const hardcodedRecolour = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('#f5deb3') && !f.includes('gallery-index.json')
})
if (hardcodedRecolour.length > 0) {
  errors.push(`Hardcoded #f5deb3 recolour found: ${hardcodedRecolour.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 3. extends resolver must not be duplicated (resolveFromDisk is the single source)
const extendsResolvers = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('node_modules')) return false
  const content = readFileSync(f, 'utf8')
  const hasExtends = content.includes('.extends') && content.includes('resolveFromDisk') === false
    && (content.includes('readFile') || content.includes('readFileSync'))
    && content.includes('extends')
  return hasExtends && content.match(/extends.*=.*meta/g)?.length > 0
})
if (extendsResolvers.length > 0) {
  errors.push(`Extends resolver duplicated: ${extendsResolvers.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 4. computeStarPoints must not reappear (AUTO_STAR_POINTS is canonical)
const starPointDups = sourceFiles.filter(f => {
  if (f.includes('__tests__')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('computeStarPoints') && !content.includes('// deleted')
})
if (starPointDups.length > 0) {
  errors.push(`computeStarPoints found (use AUTO_STAR_POINTS): ${starPointDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 5. Inline recolour (replaceAll(matchColor, ...)) must use recolourSvgText from packages/render/src/recolour.js
const inlineRecolour = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication') || f.includes('recolour.js')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('.replaceAll(matchColor') || content.includes('.replaceAll(recolourMatch')
})
if (inlineRecolour.length > 0) {
  errors.push(`Inline recolour replaceAll found (use recolourSvgText): ${inlineRecolour.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 6. Frontmatter resolver must not be duplicated — resolveFromFetch (browser) and resolveFromDisk (Node) are canonical
// Scripts that render boards use cascadeResolve for visual output only (no extends needed); that's allowed.
const resolverDups = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication') || f.includes('compare-resolvers')) return false
  if (f.includes('resolve-frontmatter.js') || f.includes('packages/play/src/play.js')) return false
  if (f.includes('scripts/export-boards') || f.includes('scripts/snapshot-boards') || f.includes('scripts/build-board-index')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('cascadeResolve(') && content.includes('parseFrontmatter(') && content.includes('familyFm')
})
if (resolverDups.length > 0) {
  errors.push(`Frontmatter resolver duplicated (use resolveFromFetch or resolveFromDisk): ${resolverDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 7. axialToPixel must not be re-implemented (use HexMath from packages/hex-generators/src/hex-math.js)
const axialDups = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication') || f.includes('hex-math.js')) return false
  const content = readFileSync(f, 'utf8')
  return (content.includes('Math.sqrt(3) * q') || content.includes('Math.sqrt(3)/2 * q') || content.includes('Math.sqrt(3) / 2 * q'))
    && (content.includes('3 / 2 * q') || content.includes('3/2 * q'))
})
if (axialDups.length > 0) {
  errors.push(`Inline axialToPixel found (use HexMath): ${axialDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 8. RULES_BASE must be defined only in js/play-shared.js
const rulesBaseDups = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication') || f.includes('play-shared.js')) return false
  const content = readFileSync(f, 'utf8')
  return /(?:const|let|var)\s+RULES_BASE\s*=/.test(content)
})
if (rulesBaseDups.length > 0) {
  errors.push(`RULES_BASE defined outside play-shared.js: ${rulesBaseDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 9. buildCrossMap must live in packages/schema/src/cross-map.js only
const crossMapDups = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication') || f.includes('cross-map.js')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('function buildCrossMap') || content.includes('function buildOpsCrossMap') || content.includes('function buildCrossMapOps')
})
if (crossMapDups.length > 0) {
  errors.push(`buildCrossMap defined outside cross-map.js: ${crossMapDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 10. indexToAlgebraic must be defined only in packages/topologies/grid/src/topology-grid.js
const algDups = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication') || f.includes('topology-grid.js')) return false
  const content = readFileSync(f, 'utf8')
  return /function indexToAlgebraic/.test(content)
})
if (algDups.length > 0) {
  errors.push(`indexToAlgebraic defined outside topology-grid.js: ${algDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 11. RPG helpers must live in packages/rpg/src only — js/rpg-*.js are view layers.
//     (#136 step 6: TRANSFORMS, interpolate, getCardFields, getCategoryDataType,
//      extractByKey, resolveDisplay, resolveLink were shadow copies in js/rpg-*.js.)
const RPG_SHADOWED = [
  'const TRANSFORMS',
  'function interpolate',
  'function getCardFields',
  'function getCategoryDataType',
  'function extractByKey',
  'function resolveDisplay',
  'function resolveLink',
]
const rpgShadows = sourceFiles.filter(f => {
  if (f.includes('__tests__')) return false
  if (!/\/js\/rpg-/.test(f)) return false
  const content = readFileSync(f, 'utf8')
  return RPG_SHADOWED.some(name => content.includes(name))
})
if (rpgShadows.length > 0) {
  errors.push(`RPG helper redefined in a view layer (import from packages/rpg/src): ${rpgShadows.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 12. Markup escaping must be escapeXml from packages/render/src/svg-escape.js.
//     Local copies drift on whether they escape `"`, which breaks attribute values.
const escDups = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication') || f.includes('svg-escape.js')) return false
  const content = readFileSync(f, 'utf8')
  return /function esc\(|const esc\s*=\s*\(/.test(content)
})
if (escDups.length > 0) {
  errors.push(`Local esc() defined (use escapeXml from packages/render/src/svg-escape.js): ${escDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

const FILE_FLOOR = 390
if (sourceFiles.length < FILE_FLOOR) {
  errors.push(`Source file count (${sourceFiles.length}) dropped below floor (${FILE_FLOOR}). Did files get removed without updating the guard?`)
}

if (errors.length > 0) {
  console.error('Duplication guard FAILED:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

console.log(`Duplication guard: OK (${sourceFiles.length} files scanned, no prohibited patterns found)`)
}

// Names that a name-matching duplication audit will keep reporting but that are
// NOT duplicates. Consult this before filing another "duplicate symbol" finding.
export const DUPLICATE_NAME_IGNORE = {
  // js/play-cells.js defines each of these twice on purpose: once in the `grid`
  // cell model and once in the `direct` cell model. Two implementations of one
  // interface, deliberately different — not copies of each other. (#136)
  toIndex: 'js/play-cells.js grid vs direct cell models: one interface, two implementations',
  setFlipped: 'js/play-cells.js grid vs direct cell models: one interface, two implementations',
}

export function checkFen4Owners(content, filePath) {
  return content.includes('FEN4_OWNERS') && content.includes("r: 'red'") && !filePath.includes('recolour.js')
}

export function checkAxialDups(content, filePath) {
  if (filePath.includes('hex-math.js')) return false
  return (content.includes('Math.sqrt(3) * q') || content.includes('Math.sqrt(3)/2 * q') || content.includes('Math.sqrt(3) / 2 * q'))
    && (content.includes('3 / 2 * q') || content.includes('3/2 * q'))
}
