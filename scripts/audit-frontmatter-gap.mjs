#!/usr/bin/env node
/**
 * Audits the gap between GAMES object rendering config and moddable-rules
 * frontmatter. For each variant, compares what the GAMES object provides
 * vs what the frontmatter declares and reports missing fields.
 *
 * This is the PROOF tool. No more "it's done" without evidence.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

import { parseFrontmatter as schemaParser } from '../packages/schema/src/parse-frontmatter.js'

// Extract GAMES object data by reading boards.js and evaluating the structure
// We'll grep out key fields per variant
const boardsSrc = readFileSync(resolve(ENGINE_ROOT, 'js/boards.js'), 'utf8')

// Find all GAMES entries and their variant configs
const RENDERING_FIELDS = ['boardStyle', 'tileSize', 'pieceSet', 'colors', 'showLabels', 'cellMap', 'hexRadius', 'hexSize', 'hexGrid', 'hexColorFn', 'pitsPerSide', 'hasStores', 'positions', 'rings', 'midpoints', 'diagonals', 'holeSpacing', 'boardSize', 'river', 'boardData', 'flat', 'decorations', 'surface']

// Parse the GAMES object to understand what each game/variant has
function extractGamesData() {
  // Find the GAMES object boundaries
  const gamesStart = boardsSrc.indexOf('const GAMES = {')
  if (gamesStart === -1) return {}

  // Find each top-level game key
  const gamePattern = /^  '([^']+)':\s*\{/gm
  const games = {}
  let match

  // We need to understand what EACH variant has in GAMES
  // Strategy: look for variant objects and extract their field names
  const variantBlockPattern = /variants:\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g

  // Simpler: for each game entry in GAMES, extract the family-level fields
  // and the variants with their fields
  const lines = boardsSrc.split('\n')
  let currentGame = null
  let currentVariant = null
  let depth = 0
  let inGames = false
  let inVariants = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('const GAMES = {')) { inGames = true; depth = 1; continue }
    if (!inGames) continue

    // Track depth
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    depth += opens - closes
    if (depth <= 0) break

    // Top-level game entry
    const gameMatch = line.match(/^  '([^']+)':\s*\{/)
    if (gameMatch && depth === 2) {
      currentGame = gameMatch[1]
      games[currentGame] = { fields: new Set(), variants: {}, variantFields: {} }
      inVariants = false
      currentVariant = null
      continue
    }

    if (!currentGame) continue

    // variants: { block
    if (line.match(/^\s+variants:\s*\{/) && currentGame) {
      inVariants = true
      continue
    }

    // Variant key
    if (inVariants) {
      const varMatch = line.match(/^\s+'([^']+)':\s*\{/)
      if (varMatch) {
        currentVariant = varMatch[1]
        games[currentGame].variants[currentVariant] = new Set()
        continue
      }

      // Fields inside variant
      if (currentVariant) {
        const fieldMatch = line.match(/^\s+(\w+):/)
        if (fieldMatch && RENDERING_FIELDS.includes(fieldMatch[1])) {
          games[currentGame].variants[currentVariant].add(fieldMatch[1])
        }
      }
    }

    // Family-level fields
    if (!inVariants && currentGame) {
      const fieldMatch = line.match(/^\s+(\w+):/)
      if (fieldMatch && RENDERING_FIELDS.includes(fieldMatch[1])) {
        games[currentGame].fields.add(fieldMatch[1])
      }
    }
  }

  return games
}

// Map GAMES field names to frontmatter equivalents
const FIELD_MAP = {
  boardStyle: 'render.cellColor (or topology.type determines it)',
  tileSize: 'render.cellSize',
  pieceSet: 'pieces.set',
  colors: 'surface (named or inline)',
  showLabels: 'render.labels',
  cellMap: 'render.zones',
  hexRadius: 'topology.radius',
  hexSize: 'render.cellSize',
  hexGrid: 'topology (radius/rows/cols)',
  hexColorFn: 'render.cellColor: tricolor',
  pitsPerSide: 'topology.cols',
  hasStores: 'topology.stores',
  positions: 'topology.positions',
  rings: 'topology.params.rings',
  midpoints: 'topology.params.midpoints',
  diagonals: 'topology.params.diagonals',
  holeSpacing: 'render.cellSize',
  boardSize: 'render.canvasSize',
  river: 'render.decorations (gap type)',
  flat: 'topology.orientation',
  decorations: 'render.decorations',
  surface: 'surface',
}

function scanFrontmatter() {
  const data = {}
  const families = readdirSync(GAMES_DIR).filter(f => {
    const contentDir = resolve(GAMES_DIR, f, 'content')
    return existsSync(contentDir)
  })

  for (const family of families) {
    const familyDir = resolve(GAMES_DIR, family, 'content')
    const variantsDir = resolve(familyDir, 'variants')

    // Read family-level engine
    const rulebook = resolve(familyDir, 'rulebook.md')
    let familyEngine = null
    if (existsSync(rulebook)) {
      const { meta } = schemaParser(readFileSync(rulebook, 'utf8'))
      if (meta.engine) familyEngine = meta.engine
    }

    data[family] = { familyEngine, variants: {} }

    if (!existsSync(variantsDir)) continue
    const variantFiles = readdirSync(variantsDir).filter(f => f.endsWith('.md'))

    for (const file of variantFiles) {
      const slug = basename(file, '.md')
      const content = readFileSync(resolve(variantsDir, file), 'utf8')
      const { meta } = schemaParser(content)
      data[family].variants[slug] = meta.engine || null
    }
  }
  return data
}

function hasFrontmatterEquivalent(field, familyEngine, variantEngine) {
  switch (field) {
    case 'boardStyle':
      // Derived from topology.type + render.cellColor + render.decorations
      return !!(familyEngine?.topology?.type || variantEngine?.topology?.type)
    case 'tileSize':
    case 'hexSize':
    case 'holeSpacing':
      return !!(familyEngine?.render?.cellSize || variantEngine?.render?.cellSize)
    case 'pieceSet':
      return !!(familyEngine?.pieces?.set || variantEngine?.pieces?.set)
    case 'colors':
    case 'surface':
      return !!(familyEngine?.surface || variantEngine?.surface)
    case 'showLabels':
      return familyEngine?.render?.labels !== undefined || variantEngine?.render?.labels !== undefined
    case 'cellMap':
      return !!(familyEngine?.render?.zones || variantEngine?.render?.zones)
    case 'hexRadius':
      return !!(familyEngine?.topology?.radius || variantEngine?.topology?.radius)
    case 'hexGrid':
      return !!(familyEngine?.topology?.radius || familyEngine?.topology?.rows || variantEngine?.topology?.radius || variantEngine?.topology?.rows)
    case 'hexColorFn':
      return (familyEngine?.render?.cellColor === 'tricolor' || variantEngine?.render?.cellColor === 'tricolor')
    case 'pitsPerSide':
      return !!(familyEngine?.topology?.cols || variantEngine?.topology?.cols)
    case 'hasStores':
      return familyEngine?.topology?.stores !== undefined || variantEngine?.topology?.stores !== undefined
    case 'positions':
      return !!(familyEngine?.topology?.positions || variantEngine?.topology?.positions)
    case 'rings':
      return !!(familyEngine?.topology?.params?.rings || variantEngine?.topology?.params?.rings)
    case 'midpoints':
      return familyEngine?.topology?.params?.midpoints !== undefined || variantEngine?.topology?.params?.midpoints !== undefined
    case 'diagonals':
      return familyEngine?.topology?.params?.diagonals !== undefined || variantEngine?.topology?.params?.diagonals !== undefined
    case 'boardSize':
      return !!(familyEngine?.render?.canvasSize || variantEngine?.render?.canvasSize)
    case 'river':
      const decors = familyEngine?.render?.decorations || variantEngine?.render?.decorations || []
      return decors.some(d => d.type === 'gap')
    case 'flat':
      return !!(familyEngine?.topology?.orientation || variantEngine?.topology?.orientation)
    case 'decorations':
      return !!(familyEngine?.render?.decorations || variantEngine?.render?.decorations)
    default:
      return false
  }
}

// --- Main ---

const gamesData = extractGamesData()
const frontmatterData = scanFrontmatter()

const args = process.argv.slice(2)
const showAll = args.includes('--all')
const familyFilter = args.find(a => !a.startsWith('--'))

let totalMissing = 0
let totalChecked = 0
const familySummary = {}

for (const [gameId, gameInfo] of Object.entries(gamesData)) {
  if (familyFilter && !gameId.includes(familyFilter)) continue

  // Map GAMES gameId to moddable-rules family slug
  // Most are the same, but some differ (e.g. 'chess' in GAMES → 'moddable-chess' in rules)
  const familySlug = findFamilySlug(gameId, frontmatterData)
  if (!familySlug) {
    if (showAll) console.log(`\n⚠ ${gameId}: no matching family in moddable-rules`)
    continue
  }

  const fm = frontmatterData[familySlug]
  const missing = []

  // Check family-level fields
  for (const field of gameInfo.fields) {
    if (!hasFrontmatterEquivalent(field, fm.familyEngine, null)) {
      missing.push({ level: 'family', field, maps_to: FIELD_MAP[field] || '?' })
    }
  }

  // Check variant-level fields
  for (const [variantId, variantFields] of Object.entries(gameInfo.variants)) {
    const variantSlug = findVariantSlug(variantId, fm.variants)
    const variantEngine = variantSlug ? fm.variants[variantSlug] : null

    for (const field of variantFields) {
      if (!hasFrontmatterEquivalent(field, fm.familyEngine, variantEngine)) {
        missing.push({ level: `variant:${variantId}`, field, maps_to: FIELD_MAP[field] || '?' })
      }
    }
    totalChecked++
  }

  if (missing.length > 0 || showAll) {
    familySummary[gameId] = missing
    totalMissing += missing.length
  }
}

// Report
console.log('=== FRONTMATTER GAP AUDIT ===\n')
console.log(`Checked: ${totalChecked} variants across ${Object.keys(gamesData).length} GAMES families`)
console.log(`Missing fields: ${totalMissing}\n`)

const sorted = Object.entries(familySummary).sort((a, b) => b[1].length - a[1].length)
for (const [gameId, missing] of sorted) {
  if (missing.length === 0) {
    console.log(`✓ ${gameId}: complete`)
  } else {
    console.log(`✗ ${gameId}: ${missing.length} missing`)
    for (const m of missing) {
      console.log(`    ${m.level} → ${m.field} (needs: ${m.maps_to})`)
    }
  }
}

function findFamilySlug(gameId, fmData) {
  if (fmData[gameId]) return gameId
  if (fmData['moddable-chess'] && gameId === 'chess') return 'moddable-chess'
  if (fmData['landlords-game'] && gameId === 'landlords') return 'landlords-game'
  // Try partial match
  for (const slug of Object.keys(fmData)) {
    if (slug.includes(gameId) || gameId.includes(slug)) return slug
  }
  return null
}

function findVariantSlug(variantId, variants) {
  if (variants[variantId]) return variantId
  // Try with dashes instead of underscores, etc.
  const normalized = variantId.replace(/_/g, '-')
  if (variants[normalized]) return normalized
  for (const slug of Object.keys(variants)) {
    if (slug.includes(variantId) || variantId.includes(slug)) return slug
  }
  return null
}
