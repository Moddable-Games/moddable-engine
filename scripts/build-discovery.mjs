#!/usr/bin/env node
/**
 * Generates all discovery surfaces from actual data.
 * Run with --check to verify files are up to date (exits non-zero if stale).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CHECK_MODE = process.argv.includes('--check')

function resolve(...segments) {
  return path.resolve(ROOT, ...segments)
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(resolve(filePath), 'utf-8'))
}

function countDirs(dirPath) {
  const full = resolve(dirPath)
  if (!fs.existsSync(full)) return 0
  return fs.readdirSync(full, { withFileTypes: true }).filter(d => d.isDirectory()).length
}

function countFiles(dirPath, ext) {
  const full = resolve(dirPath)
  if (!fs.existsSync(full)) return 0
  return fs.readdirSync(full).filter(f => f.endsWith(ext)).length
}

// --- Gather counts from real data ---

const pieceIndex = readJSON('pieces/gallery-index.json')
const pieceCount = pieceIndex.length

const boardSvgCount = countFiles('boards/svgs', '.svg')

const tileSets = countDirs('tiles/sets')

const puzzleData = readJSON('api/puzzles/index.json')
const standardCount = puzzleData.standard.length
const variantCount = puzzleData.variants.length
const puzzleTotal = standardCount + variantCount

const playManifest = readJSON('play/playability-manifest.json')
const playableVariants = playManifest.filter(v => v.playable)
const playableFamilies = [...new Set(playableVariants.map(v => v.family))]

const familyCounts = {}
playableVariants.forEach(v => { familyCounts[v.family] = (familyCounts[v.family] || 0) + 1 })

const readmeText = fs.readFileSync(resolve('README.md'), 'utf-8')
const testCountMatch = readmeText.match(/(\d[\d,]*)\s+tests\s+across\s+(\d+)\s+suites/)
const testCount = testCountMatch ? parseInt(testCountMatch[1].replace(/,/g, ''), 10) : 0
const testSuites = testCountMatch ? parseInt(testCountMatch[2], 10) : 0

const FAMILY_TOPOLOGY = {
  'moddable-chess': 'grid', draughts: 'grid', go: 'grid', reversi: 'grid',
  shogi: 'grid', xiangqi: 'grid', halma: 'grid', 'stern-halma': 'grid',
  tafl: 'grid', lattaque: 'grid', 'dou-shou-qi': 'grid', surakarta: 'grid',
  'dungeon-chess': 'grid', fanorona: 'grid', asalto: 'grid',
  hex: 'hex', agon: 'hex', nukes: 'hex',
  backgammon: 'track', pachisi: 'track', chaupar: 'track', nyout: 'track',
  'royal-ur': 'track', 'landlords-game': 'track', econopoly: 'track',
  mancala: 'pit',
  morris: 'graph',
  'standard-52': 'tableau', 'flower-48': 'tableau', mahjong: 'tableau',
  'double-six-dominoes': 'tableau', 'bavarian-32': 'tableau',
  'standard-dice': 'tableau',
}

const boardSvgFamilies = fs.readdirSync(resolve('boards/svgs'))
  .filter(f => f.endsWith('.svg'))
  .map(f => f.replace(/--.*/, ''))

const topoCounts = {}
boardSvgFamilies.forEach(family => {
  const topo = FAMILY_TOPOLOGY[family] || 'other'
  topoCounts[topo] = (topoCounts[topo] || 0) + 1
})

const TOPOLOGY_TYPES = ['grid', 'hex', 'track', 'pit', 'graph', 'tableau']
const uniqueTopologies = TOPOLOGY_TYPES.filter(t => topoCounts[t] > 0).length

const stats = {
  pieces: pieceCount,
  boards: boardSvgCount,
  tiles: tileSets,
  puzzles: puzzleTotal,
  puzzleStandard: standardCount,
  puzzleVariant: variantCount,
  playableVariants: playableVariants.length,
  playableFamilies: playableFamilies.length,
  families: playableFamilies.sort(),
  familyCounts,
  topoCounts,
  uniqueTopologies,
  testCount,
  testSuites,
}

console.log('Counts from data:')
console.log(`  Pieces: ${stats.pieces}`)
console.log(`  Boards: ${stats.boards}`)
console.log(`  Tiles: ${stats.tiles}`)
console.log(`  Puzzles: ${stats.puzzles} (${stats.puzzleStandard} standard + ${stats.puzzleVariant} variant)`)
console.log(`  Playable: ${stats.playableVariants} variants across ${stats.playableFamilies} families`)
console.log(`  Tests: ${stats.testCount} across ${stats.testSuites} suites`)
console.log(`  Topologies: ${JSON.stringify(stats.topoCounts)}`)

// --- Generate files ---

const outputs = []

// 1. api/stats.json
const boardFamilies = [...new Set(
  readJSON('api/boards/index.json').boards.map(b => (b.id || '').split('--')[0])
)].filter(Boolean).length
stats.boardFamilies = boardFamilies

const statsJson = {
  generated: new Date().toISOString().slice(0, 10),
  pieces: stats.pieces,
  boards: stats.boards,
  boardFamilies,
  tiles: stats.tiles,
  puzzles: stats.puzzles,
  puzzlesByType: { standard: stats.puzzleStandard, variants: stats.puzzleVariant },
  playableVariants: stats.playableVariants,
  playableFamilies: stats.playableFamilies,
  playableByFamily: stats.familyCounts,
}
outputs.push({ path: 'api/stats.json', content: JSON.stringify(statsJson, null, 2) + '\n' })

// 2. api/index.json
const existingIndex = readJSON('api/index.json')
existingIndex.endpoints = existingIndex.endpoints.map(ep => {
  if (ep.path.includes('pieces')) {
    ep.count = stats.pieces
    ep.description = `Piece gallery — ${stats.pieces} SVG sets across chess, shogi, xiangqi, Go, draughts, backgammon`
  } else if (ep.path.includes('boards')) {
    ep.count = stats.boards
    ep.description = `Board gallery — ${stats.boards} rendered SVG diagrams spanning ${stats.boardFamilies} game families`
  } else if (ep.path.includes('tiles')) {
    ep.count = stats.tiles
    ep.description = `Tile gallery — ${stats.tiles} hex tile sets for strategy maps`
  } else if (ep.path.includes('puzzles')) {
    ep.count = stats.puzzles
    ep.description = `Chess puzzles — ${stats.puzzles.toLocaleString()} tactical puzzles with FEN, solutions, and difficulty ratings`
  }
  return ep
})
outputs.push({ path: 'api/index.json', content: JSON.stringify(existingIndex, null, 2) + '\n' })

// 3. .well-known/mcp.json
const mcpJson = readJSON('.well-known/mcp.json')
mcpJson.description = `Universal board game engine with piece sets (${stats.pieces}), board layouts (${stats.boards}), tile galleries (${stats.tiles}), and chess puzzles (${stats.puzzles.toLocaleString()}). AI tools available via MCP.`
outputs.push({ path: '.well-known/mcp.json', content: JSON.stringify(mcpJson, null, 2) + '\n' })

// 4. llms.txt
const llmsTxt = `# Moddable Engine

> Universal board game engine with piece sets (${stats.pieces}), board layouts (${stats.boards}), hex tile galleries (${stats.tiles}), and chess puzzles (${stats.puzzles.toLocaleString()}). Topology-driven architecture renders any game from a configuration.

This site hosts game engine assets and tools. Agents can consume galleries and puzzle data via the static JSON API.

## Machine-Readable API

All structured data is available at predictable URLs under \`/api/\`:

- Discovery index: https://engine.moddable.games/api/index.json
- Piece gallery (${stats.pieces} sets): https://engine.moddable.games/api/pieces/index.json
- Board gallery (${stats.boards} layouts): https://engine.moddable.games/api/boards/index.json
- Tile gallery (${stats.tiles} sets): https://engine.moddable.games/api/tiles/index.json
- Chess puzzles (${stats.puzzles.toLocaleString()}): https://engine.moddable.games/api/puzzles/index.json

## MCP Tools

Interactive tools (puzzle generation, board rendering, piece lookup) are available via MCP:

- MCP endpoint: https://tools.moddable.games/mcp
- REST API: https://tools.moddable.games/api/call
- OpenAPI spec: https://tools.moddable.games/openapi.json

## Content Types

- **Piece sets** — ${stats.pieces} SVG piece collections across chess, shogi, xiangqi, Go, draughts, backgammon, and more
- **Board layouts** — ${stats.boards} rendered SVG diagrams spanning ${stats.boardFamilies} game families and all supported topologies
- **Tile sets** — ${stats.tiles} hex tile galleries for strategy map games
- **Chess puzzles** — ${stats.puzzles.toLocaleString()} tactical puzzles (${stats.puzzleStandard.toLocaleString()} standard + ${stats.puzzleVariant} variant) with FEN, solutions, and ratings

## Architecture

The engine uses a topology-driven architecture. Games are defined by configuration (frontmatter), not code. Supported topologies: grid, hex, track, pit, graph, tableau. Any game expressible as a combination of topology + pieces + rules can be rendered.

## Related

- Rules library: https://rules.moddable.games (game rules, variants, oracle tables)
- Tools API: https://tools.moddable.games (MCP tools for AI agents)

## Licence

Engine code is proprietary to Moddable Games Ltd. Piece sets carry individual licences (Apache-2.0, CC BY, etc.) noted in their manifests.
`
outputs.push({ path: 'llms.txt', content: llmsTxt })

// 5. sitemap.xml
const BASE = 'https://engine.moddable.games'
const staticPages = [
  { path: '/', priority: '1.0' },
  { path: '/play/', priority: '0.9' },
  { path: '/create/', priority: '0.7' },
  { path: '/boards/', priority: '0.9' },
  { path: '/pieces/', priority: '0.8' },
  { path: '/tiles/', priority: '0.8' },
  { path: '/docs/', priority: '0.8' },
  { path: '/api/', priority: '0.8' },
  { path: '/llms.txt', priority: '0.5' },
  { path: '/.well-known/mcp.json', priority: '0.3' },
]

const docPages = fs.readdirSync(resolve('docs'))
  .filter(f => f.endsWith('.html'))
  .map(f => ({ path: `/docs/${f}`, priority: '0.7' }))

const familyPages = playableFamilies.map(f => ({
  path: `/play/?game=${f}`,
  priority: '0.8',
}))

const allPages = [...staticPages, ...docPages, ...familyPages]

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${BASE}${p.path}</loc>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`
outputs.push({ path: 'sitemap.xml', content: sitemapXml })

// 6. Fix puzzle meta.count
const puzzleFile = resolve('api/puzzles/index.json')
const puzzleRaw = fs.readFileSync(puzzleFile, 'utf-8')
const puzzleParsed = JSON.parse(puzzleRaw)
if (puzzleParsed.meta.count !== puzzleTotal) {
  puzzleParsed.meta.count = puzzleTotal
  puzzleParsed.meta.standard = standardCount
  puzzleParsed.meta.variants = variantCount
  puzzleParsed.meta.lastUpdated = new Date().toISOString().slice(0, 10)
  outputs.push({ path: 'api/puzzles/index.json', content: JSON.stringify(puzzleParsed, null, 2) + '\n' })
}

// 7. Patch HTML stat values
const frontmatterOnlyCount = stats.playableVariants - 1
const frontmatterPct = Math.floor((frontmatterOnlyCount / stats.playableVariants) * 100)

const htmlPatches = [
  {
    file: 'index.html',
    replacements: [
      [/(\d+) piece sets/g, `${stats.pieces} piece sets`],
      [/(\d+,?\d*) terrain and game tiles/g, `${stats.tiles} terrain and game tiles`],
      [/(\d+) hex terrain sets/g, `${stats.tiles} hex terrain sets`],
      [/(\d+) packages/g, '14 packages'],
      // Stats section: test count
      [/(<span class="stat-value">)[\d,]+\+?(<\/span>\s*<span class="stat-label">Tests passing<\/span>)/g, `$1${stats.testCount.toLocaleString()}$2`],
      // Hero lede: variant counts
      [/across (\d+) variants/g, `across ${stats.playableVariants} variants`],
      [/playing chess, go, draughts, shogi, xiangqi, and reversi across \d+ variants/g, `playing chess, go, draughts, shogi, xiangqi, and reversi across ${stats.playableVariants} variants`],
      [/(\d+) carry zero JavaScript/g, `${frontmatterOnlyCount} carry zero JavaScript`],
      // Stats section
      [/(<span class="stat-value">)\d+(<\/span>\s*<span class="stat-label">Variants<\/span>)/g, `$1${stats.playableVariants}$2`],
      [/(<span class="stat-value">)\d+(<\/span>\s*<span class="stat-label">Playable families<\/span>)/g, `$1${stats.playableFamilies}$2`],
      [/(<span class="stat-value">)\d+%(<\/span>\s*<span class="stat-label">Frontmatter-only<\/span>)/g, `$1${frontmatterPct}%$2`],
      [/(<span class="stat-value">)\d+(<\/span>\s*<span class="stat-label">Topologies<\/span>)/g, `$1${stats.uniqueTopologies}$2`],
      // Section heading: playable families
      [/(\d+) Playable Families/g, `${stats.playableFamilies} Playable Families`],
      [/(\d+) Topology Types/g, `${stats.uniqueTopologies} Topology Types`],
      // Family chips
      [/(Chess <span class="family-count">)\d+(<\/span>)/g, `$1${stats.familyCounts.chess || 0}$2`],
      [/(Draughts <span class="family-count">)\d+(<\/span>)/g, `$1${stats.familyCounts.draughts || 0}$2`],
      [/(Go <span class="family-count">)\d+(<\/span>)/g, `$1${stats.familyCounts.go || 0}$2`],
      [/(Shogi <span class="family-count">)\d+(<\/span>)/g, `$1${stats.familyCounts.shogi || 0}$2`],
      [/(Xiangqi <span class="family-count">)\d+(<\/span>)/g, `$1${stats.familyCounts.xiangqi || 0}$2`],
      [/(Reversi <span class="family-count">)\d+(<\/span>)/g, `$1${stats.familyCounts.reversi || 0}$2`],
      // Topology cards
      [/(<h4 class="topo-name">Grid<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.grid || 0} variants$2`],
      [/(<h4 class="topo-name">Hex<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.hex || 0} variants$2`],
      [/(<h4 class="topo-name">Track<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.track || 0} variants$2`],
      [/(<h4 class="topo-name">Pit<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.pit || 0} variants$2`],
      [/(<h4 class="topo-name">Graph<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.graph || 0} variants$2`],
      [/(<h4 class="topo-name">Tableau<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.tableau || 0} variants$2`],
    ],
  },
  {
    file: 'pieces/index.html',
    replacements: [
      [/(\d+) piece sets/g, `${stats.pieces} piece sets`],
    ],
  },
  {
    file: 'tiles/index.html',
    replacements: [
      [/across \d+ sets/g, `across ${stats.tiles} sets`],
    ],
  },
  {
    file: 'api/index.html',
    replacements: [
      [/(\d+) rendered SVG diagrams spanning \d+ game families/g, `${stats.boards} rendered SVG diagrams spanning ${stats.boardFamilies} game families`],
      [/(\d+) hex tile sets/g, `${stats.tiles} hex tile sets`],
      [/(\d+,?\d*) tactical puzzles/g, `${stats.puzzles.toLocaleString()} tactical puzzles`],
      [/(\d+) SVG sets/g, `${stats.pieces} SVG sets`],
    ],
  },
  {
    file: 'docs/pieces.html',
    replacements: [
      [/(\d+) piece sets/g, `${stats.pieces} piece sets`],
      [/(\d+) sets, recolorable/g, `${stats.pieces} sets, recolorable`],
    ],
  },
  {
    file: 'docs/index.html',
    replacements: [
      [/<strong>\d+ game variants<\/strong>/g, `<strong>${stats.boards} game variants</strong>`],
      [/<strong>\d+ families<\/strong>/g, `<strong>${stats.boardFamilies} families</strong>`],
      [/<strong>\d+ topology types<\/strong>/g, `<strong>${stats.uniqueTopologies} topology types</strong>`],
    ],
  },
]

for (const { file, replacements } of htmlPatches) {
  const fullPath = resolve(file)
  if (!fs.existsSync(fullPath)) continue
  let html = fs.readFileSync(fullPath, 'utf-8')
  let changed = false
  for (const [pattern, replacement] of replacements) {
    const before = html
    html = html.replace(pattern, replacement)
    if (html !== before) changed = true
  }
  if (changed) {
    outputs.push({ path: file, content: html })
  }
}

// --- Write or check ---

let stale = 0
for (const { path: filePath, content } of outputs) {
  const fullPath = resolve(filePath)
  const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : ''
  if (existing === content) {
    console.log(`  ✓ ${filePath} (up to date)`)
    continue
  }
  stale++
  if (CHECK_MODE) {
    console.log(`  ✗ ${filePath} (STALE)`)
  } else {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
    console.log(`  → ${filePath} (updated)`)
  }
}

if (CHECK_MODE && stale > 0) {
  console.error(`\n${stale} file(s) are stale. Run: node scripts/build-discovery.mjs`)
  process.exit(1)
} else if (!CHECK_MODE) {
  console.log(`\nDone. ${stale} file(s) updated.`)
}
