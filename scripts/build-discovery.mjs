#!/usr/bin/env node
/**
 * Generates all discovery surfaces from actual data.
 * Run with --check to verify files are up to date (exits non-zero if stale).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withStableGeneratedDate } from './lib/stable-generated-date.mjs'
import '../packages/hex-generators/index.js'
import { getRegisteredGames, getGameConfig } from '../packages/hex-generators/src/game-registry.js'
import { buildFamilyPages, familyChips, footerFamiliesColumn, familiesIndex } from './lib/family-pages.mjs'
import { buildDocsToc } from './lib/docs-toc.mjs'
import { sdkCapabilities } from './lib/sdk-capabilities.mjs'

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
const tileIndexJson = fs.readFileSync(resolve('tiles/tile-index.json'), 'utf-8')
const tileSetIds = JSON.parse(tileIndexJson).map(set => set.id)

// Which tile styles each hex generator can actually offer, asked of the
// generators rather than transcribed into the docs by hand.
const hexGames = getRegisteredGames().map(key => ({ key, config: getGameConfig(key) }))
const hexStyles = Object.fromEntries(hexGames.map(({ key, config }) => [key, (config.styles || []).slice().sort()]))
const allHexStyles = [...new Set(Object.values(hexStyles).flat())].sort()

const puzzleData = readJSON('api/puzzles/index.json')
const standardCount = puzzleData.standard.length
const variantCount = puzzleData.variants.length
const puzzleTotal = standardCount + variantCount
// The pool spans every playable family now, not chess alone; the count is read
// from the records rather than said.
const puzzleFamilies = new Set([...puzzleData.standard, ...puzzleData.variants].map(r => r.family || 'chess')).size

const playManifest = readJSON('play/playability-manifest.json')
const playableVariants = playManifest.filter(v => v.playable)
const playableFamilies = [...new Set(playableVariants.map(v => v.family))]


const familyCounts = {}
playableVariants.forEach(v => { familyCounts[v.family] = (familyCounts[v.family] || 0) + 1 })

// Count variant plugins per family (files in packages/plugins/{family}/src/variants/)
const variantPluginCounts = {}
for (const family of playableFamilies) {
  const variantsDir = resolve(`packages/plugins/${family}/src/variants`)
  if (fs.existsSync(variantsDir)) {
    const indexFile = path.join(variantsDir, 'index.js')
    if (fs.existsSync(indexFile)) {
      const indexContent = fs.readFileSync(indexFile, 'utf-8')
      variantPluginCounts[family] = (indexContent.match(/^export /gm) || []).length
    } else {
      variantPluginCounts[family] = fs.readdirSync(variantsDir).filter(f => f.endsWith('.js') && f !== 'index.js').length
    }
  } else {
    variantPluginCounts[family] = 0
  }
}

const frontmatterOnlyCounts = {}
for (const family of playableFamilies) {
  frontmatterOnlyCounts[family] = (familyCounts[family] || 0) - (variantPluginCounts[family] || 0)
}


// The test count comes from the test run, via the reporter in
// `scripts/lib/test-count-reporter.cjs`, which writes `api/test-counts.json`
// whenever the full suite passes.
//
// It used to come from a regex over README.md. The first line that matched sat
// inside a dated changelog entry from July, so `api/stats.json`, `llms.txt` and
// the site published "1367 tests across 104 suites" for five weeks while the
// real figures were 6267 and 173. `--check` passed throughout, because it only
// compared the generated files against the scrape and never asked whether the
// scrape was true. A number that describes the test suite is now produced by
// running the test suite, and there is nowhere left to type it by hand.
const countsPath = resolve('api/test-counts.json')
let testCount = 0
let testsPassing = 0
let testSuites = 0
let snapshotCount = 0
if (fs.existsSync(countsPath)) {
  const counts = JSON.parse(fs.readFileSync(countsPath, 'utf-8'))
  testCount = counts.tests || 0
  // The site's card is labelled "Tests passing", so it gets the tests that
  // passed rather than the tests that ran. Six are skipped.
  testsPassing = counts.passed || 0
  testSuites = counts.suites || 0
  snapshotCount = counts.snapshots || 0
} else {
  console.warn('  ! api/test-counts.json is missing. Run `npm test` to produce it.')
  console.warn('    Publishing zero rather than a number nobody measured.')
}

// Which topology each board is, as the board index records it from the
// board's own frontmatter. This was a hand-kept family-to-topology table that
// had lost chess (154 boards counted as "other") and put Royal Ur, a grid, on
// a track.
const boardIndex = readJSON('boards/board-index.json')
const topoCounts = {}
for (const board of boardIndex) topoCounts[board.topology] = (topoCounts[board.topology] || 0) + 1

const TOPOLOGY_TYPES = Object.keys(topoCounts).sort((a, b) => topoCounts[b] - topoCounts[a])
const uniqueTopologies = TOPOLOGY_TYPES.length

const stats = {
  pieces: pieceCount,
  boards: boardSvgCount,
  tiles: tileSets,
  puzzles: puzzleTotal,
  puzzleFamilies,
  puzzleStandard: standardCount,
  puzzleVariant: variantCount,
  playableVariants: playableVariants.length,
  playableFamilies: playableFamilies.length,
  families: playableFamilies.sort(),
  familyCounts,
  topoCounts,
  uniqueTopologies,
  testCount,
  testsPassing,
  testSuites,
  snapshotCount,
}

console.log('Counts from data:')
console.log(`  Pieces: ${stats.pieces}`)
console.log(`  Boards: ${stats.boards}`)
console.log(`  Tiles: ${stats.tiles}`)
console.log(`  Puzzles: ${stats.puzzles} (${stats.puzzleStandard} standard + ${stats.puzzleVariant} variant)`)
console.log(`  Playable: ${stats.playableVariants} variants across ${stats.playableFamilies} families`)
console.log(`  Tests: ${stats.testCount} across ${stats.testSuites} suites, ${stats.snapshotCount} snapshots`)
console.log(`  Topologies: ${JSON.stringify(stats.topoCounts)}`)

// --- Generate files ---

const outputs = []

// What the SDK does for each family, measured by running it.
const sdkRows = sdkCapabilities(playManifest)
const docsPages = new Set(fs.readdirSync(resolve('docs')))
const PLUGIN_DOCS = { race: 'race.html', hop: 'hop.html', backgammon: 'backgammon.html', chess: 'hosted-families.html', draughts: 'hosted-families.html' }
const sdkDocFor = (row) => (docsPages.has(`${row.family}.html`) ? `${row.family}.html`
  : row.family !== row.plugin && PLUGIN_DOCS[row.plugin] ? PLUGIN_DOCS[row.plugin]
    : PLUGIN_DOCS[row.plugin] || (row.svg === 'no' && row.hidden ? 'tableau.html' : null))
const docsLabels = Object.fromEntries(readJSON('docs/toc.json').groups.flatMap(g => g.pages.map(([file, label]) => [file, label])))
const tick = (flag) => (flag ? '&#x2713;' : '')
const sdkTable = `  <table class="docs-table">
    <thead>
      <tr><th>Family</th><th>Plugin</th><th><code>createAI</code></th><th><code>renderStateAsSvg</code></th><th>Dice</th><th>Hidden hands</th><th>Docs</th></tr>
    </thead>
    <tbody>
${sdkRows.map(r => `      <tr id="${r.family}"><td><a href="../families/${r.family}/">${r.label}</a></td><td>${r.plugin || ''}</td><td>${r.error ? 'error' : r.ai || ''}</td><td>${r.svg || ''}</td><td>${tick(r.chance)}</td><td>${tick(r.hidden)}</td><td>${sdkDocFor(r) ? `<a href="${sdkDocFor(r)}">${docsLabels[sdkDocFor(r)] || sdkDocFor(r)}</a>` : ''}</td></tr>`).join('\n')}
    </tbody>
  </table>`

// 0. Family landing pages, generated for every playable family without a
// hand-written one, and the homepage chips and page footers that list them.
const RULES_ROOT = process.env.MODDABLE_RULES_DIR || path.join(ROOT, '..', 'moddable-rules', 'games')
const siteVersion = fs.readFileSync(resolve('version.txt'), 'utf-8').trim()
const familySymbols = readJSON('data/family-symbols.json')
const familyDocs = Object.fromEntries(sdkRows.map(r => [r.family, sdkDocFor(r) ? `../../docs/${sdkDocFor(r)}` : `../../docs/sdk.html#${r.family}`]))
const familyPages = buildFamilyPages({ root: ROOT, rulesRoot: RULES_ROOT, manifest: playManifest, boardIndex, version: siteVersion, symbols: familySymbols, docs: familyDocs })
outputs.push(...familyPages.outputs)
outputs.push(familiesIndex({
  pages: familyPages.pages, counts: familyPages.counts, symbols: familySymbols, version: siteVersion,
  template: familyPages.outputs[0]?.content || fs.readFileSync(resolve('families/tafl/index.html'), 'utf-8'),
}))
// The docs navigation, from docs/toc.json, in every docs page.
outputs.push(...buildDocsToc(ROOT))

// 1. api/stats.json
// From the gallery index rather than the published copy of it: the published
// copy is generated further down this same script, so reading it here would
// have counted last run's families.
const boardFamilies = [...new Set(
  (readJSON('boards/board-index.json').boards || readJSON('boards/board-index.json'))
    .map(b => (b.svg || '').replace(/^svgs\//, '').split('--')[0])
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
  variantPluginsByFamily: variantPluginCounts,
  frontmatterOnlyByFamily: frontmatterOnlyCounts,
  // Measured by the test run, via scripts/lib/test-count-reporter.cjs.
  tests: stats.testCount,
  testsPassing: stats.testsPassing,
  testSuites: stats.testSuites,
  snapshots: stats.snapshotCount,
}
// Carried forward when only the clock moved, so a push on a later day than
// the last regeneration does not fail --check on its own. See the module.
const statsPath = resolve('api/stats.json')
const stableStats = withStableGeneratedDate(
  statsJson,
  fs.existsSync(statsPath) ? fs.readFileSync(statsPath, 'utf-8') : ''
)
outputs.push({ path: 'api/stats.json', content: JSON.stringify(stableStats, null, 2) + '\n' })

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
    ep.description = `Puzzles — ${stats.puzzles.toLocaleString()} puzzles across ${stats.puzzleFamilies} game families, with positions, solutions, licences and difficulty measured by the engine's own AI`
  }
  return ep
})
outputs.push({ path: 'api/index.json', content: JSON.stringify(existingIndex, null, 2) + '\n' })

// 3. .well-known/mcp.json
const mcpJson = readJSON('.well-known/mcp.json')
mcpJson.description = `Universal board game engine with piece sets (${stats.pieces}), board layouts (${stats.boards}), tile galleries (${stats.tiles}), and puzzles across ${stats.puzzleFamilies} game families (${stats.puzzles.toLocaleString()}). AI tools available via MCP.`
outputs.push({ path: '.well-known/mcp.json', content: JSON.stringify(mcpJson, null, 2) + '\n' })

// 4. llms.txt
const llmsTxt = `# Moddable Engine

> Universal board game engine with piece sets (${stats.pieces}), board layouts (${stats.boards}), hex tile galleries (${stats.tiles}), and puzzles across ${stats.puzzleFamilies} game families (${stats.puzzles.toLocaleString()}). Topology-driven architecture renders any game from a configuration.

This site hosts game engine assets and tools. Agents can consume galleries and puzzle data via the static JSON API.

## Machine-Readable API

All structured data is available at predictable URLs under \`/api/\`:

- Discovery index: https://engine.moddable.games/api/index.json
- Piece gallery (${stats.pieces} sets): https://engine.moddable.games/api/pieces/index.json
- Board gallery (${stats.boards} layouts): https://engine.moddable.games/api/boards/index.json
- Tile gallery (${stats.tiles} sets): https://engine.moddable.games/api/tiles/index.json
- Puzzles (${stats.puzzles.toLocaleString()}, ${stats.puzzleFamilies} families): https://engine.moddable.games/api/puzzles/index.json

## MCP Tools

Interactive tools (puzzle generation, board rendering, piece lookup) are available via MCP:

- MCP endpoint: https://tools.moddable.games/mcp
- REST API: https://tools.moddable.games/api/call
- OpenAPI spec: https://tools.moddable.games/openapi.json

## Content Types

- **Piece sets** — ${stats.pieces} SVG piece collections across chess, shogi, xiangqi, Go, draughts, backgammon, and more
- **Board layouts** — ${stats.boards} rendered SVG diagrams spanning ${stats.boardFamilies} game families and all supported topologies
- **Tile sets** — ${stats.tiles} hex tile galleries for strategy map games
- **Puzzles** — ${stats.puzzles.toLocaleString()} puzzles (${stats.puzzleStandard.toLocaleString()} standard chess + ${stats.puzzleVariant} across ${stats.puzzleFamilies} families) with positions, solutions, per-record licences and AI-measured difficulty

## Architecture

The engine uses a topology-driven architecture. Games are defined by configuration (frontmatter), not code. Supported topologies: ${TOPOLOGY_TYPES.join(', ')}. Any game expressible as a combination of topology + pieces + rules can be rendered.

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
  { path: '/families/', priority: '0.9' },
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

const familyPlayPages = playableFamilies.map(f => ({
  path: `/play/?game=${f}`,
  priority: '0.8',
}))

// A family with a landing page of its own. The component families - a deck,
// dominoes, dice - are played from the play page and have none yet.
const familyLandingPages = familyPages.pages.map(({ family: f }) => ({
  path: `/families/${f}/`,
  priority: '0.9',
}))

// Every topology with a landing page of its own.
const topologyNames = TOPOLOGY_TYPES.filter(t => fs.existsSync(resolve('topologies', t, 'index.html')))
const topologyLandingPages = topologyNames.map(t => ({
  path: `/topologies/${t}/`,
  priority: '0.8',
}))

const allPages = [...staticPages, ...familyLandingPages, ...topologyLandingPages, ...docPages, ...familyPlayPages]

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

// 6a. api/boards/index.json — the published board gallery.
//
// Written by hand once and never again: it still carried the pre-rename
// `moddable-chess--*` ids months after those 153 files were deleted, listed a
// yalta board that does not render, and was missing every variant added since.
// Generated from boards/board-index.json, which is itself generated from the
// snapshots, so the published list cannot disagree with the files it names.
const boardEntries = (boardIndex.boards || boardIndex).map(b => {
  const id = b.svg.replace(/^svgs\//, '').replace(/\.svg$/, '')
  return { id, file: `${id}.svg`, url: `/boards/svgs/${id}.svg` }
})
outputs.push({
  path: 'api/boards/index.json',
  content: withStableGeneratedDate(
    JSON.stringify({ meta: { count: boardEntries.length, generated: new Date().toISOString().slice(0, 10) }, boards: boardEntries }, null, 2) + '\n',
    resolve('api/boards/index.json')
  ),
})

// 6b. api/tiles/index.json — the published copy of the tile index. Two hand-kept
// copies of the same list is how they drift, so the source is copied verbatim.
outputs.push({ path: 'api/tiles/index.json', content: tileIndexJson })

// 7. Patch HTML stat values
const frontmatterOnlyCount = stats.playableVariants - 1
const frontmatterPct = Math.floor((frontmatterOnlyCount / stats.playableVariants) * 100)
const ogDesc = `One engine for every board game. ${stats.playableFamilies} playable families, ${stats.playableVariants} variants, ${stats.uniqueTopologies} topologies. Games are configuration files, not code.`

const TOPOLOGY_LABELS = { grid: 'Grid', hex: 'Hex', track: 'Track', pit: 'Pit', graph: 'Graph', tableau: 'Tableau', 'hexagonal-trisection': 'Hexagonal Trisection', triangular: 'Triangular' }
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// The plugins there are, read from their directories rather than said.
const pluginNames = fs.readdirSync(resolve('packages/plugins'), { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(resolve('packages/plugins', d.name, 'index.js')))
  .map(d => d.name)
  .sort()
const pluginProse = pluginNames.map(n => (n === 'landlords-game' ? "the Landlord's Game" : n)).join(', ').replace(/, ([^,]+)$/, ' and $1')

const htmlPatches = [
  {
    file: 'docs/sdk.html',
    replacements: [[/(<!-- sdk-table:start -->)[\s\S]*?(<!-- sdk-table:end -->)/, `$1\n${sdkTable}\n  $2`]],
  },
  {
    file: 'docs/plugins.html',
    replacements: [
      [/The engine has \d+ built-in plugins covering [^.]*\./g, `The engine has ${pluginNames.length} built-in plugins: ${pluginProse}. Families without a plugin of their own name one of these in their rulebook; see <a href="hosted-families.html">Families on Shared Plugins</a>.`],
      [/(content=")\d+ plugin families covering [^"]*(")/g, `$1${pluginNames.length} plugins playing ${stats.playableFamilies} families, from chess and go to race, hopping and card games.$2`],
    ],
  },
  {
    file: 'index.html',
    replacements: [
      // OG and meta descriptions with stats
      [/(content="One engine for every board game\.) \d+ playable families, \d+ variants, \d+ topologies\./g, `$1 ${stats.playableFamilies} playable families, ${stats.playableVariants} variants, ${stats.uniqueTopologies} topologies.`],
      [/(\d+) piece sets/g, `${stats.pieces} piece sets`],
      [/(\d+,?\d*) terrain and game tiles/g, `${stats.tiles} terrain and game tiles`],
      [/(\d+) hex terrain sets/g, `${stats.tiles} hex terrain sets`],
      [/(\d+) packages/g, '14 packages'],
      // Stats section: test count
      [/(<span class="stat-value">)[\d,]+\+?(<\/span>\s*<span class="stat-label">Tests passing<\/span>)/g, `$1${stats.testsPassing.toLocaleString()}$2`],
      // Hero lede: variant counts
      [/across (\d+) variants/g, `across ${stats.playableVariants} variants`],
      [/playing [\w, ]+and the Landlord's Game across \d+ variants/g, `playing chess, go, draughts, hex, shogi, xiangqi, mancala, morris, reversi, and the Landlord's Game across ${stats.playableVariants} variants`],
      [/(\d+) carry zero JavaScript/g, `${frontmatterOnlyCount} carry zero JavaScript`],
      // Stats section
      [/(<span class="stat-value">)\d+(<\/span>\s*<span class="stat-label">Variants<\/span>)/g, `$1${stats.playableVariants}$2`],
      [/(<span class="stat-value">)\d+(<\/span>\s*<span class="stat-label">Playable families<\/span>)/g, `$1${stats.playableFamilies}$2`],
      [/(<span class="stat-value">)\d+%(<\/span>\s*<span class="stat-label">Frontmatter-only<\/span>)/g, `$1${frontmatterPct}%$2`],
      [/(<span class="stat-value">)\d+(<\/span>\s*<span class="stat-label">Topologies<\/span>)/g, `$1${stats.uniqueTopologies}$2`],
      // Section heading: playable families
      [/(\d+) Playable Families/g, `${stats.playableFamilies} Playable Families`],
      [/(\d+) Topology Types/g, `${stats.uniqueTopologies} Topology Types`],
      // Family chips: every playable family, generated between the markers.
      [/(<!-- family-chips:start -->)[\s\S]*?(<!-- family-chips:end -->)/, `$1\n${familyChips(familyPages.pages, stats.familyCounts, familySymbols)}\n      $2`],
      // Topology cards
      [/(<h4 class="topo-name">Grid<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.grid || 0} variants$2`],
      [/(<h4 class="topo-name">Hex<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.hex || 0} variants$2`],
      [/(<h4 class="topo-name">Track<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.track || 0} variants$2`],
      [/(<h4 class="topo-name">Pit<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.pit || 0} variants$2`],
      [/(<h4 class="topo-name">Graph<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.graph || 0} variants$2`],
      [/(<h4 class="topo-name">Tableau<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants(<\/span>)/g, `$1${stats.topoCounts.tableau || 0} variants$2`],
      [/(<h4 class="topo-name">Hexagonal Trisection<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants?(<\/span>)/g, `$1${plural(stats.topoCounts['hexagonal-trisection'] || 0, 'variant')}$2`],
      [/(<h4 class="topo-name">Triangular<\/h4>[\s\S]*?<span class="topo-count">)\d+ variants?(<\/span>)/g, `$1${plural(stats.topoCounts.triangular || 0, 'variant')}$2`],
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
      [/(\d+,?\d*) puzzles across \d+ game families/g, `${stats.puzzles.toLocaleString()} puzzles across ${stats.puzzleFamilies} game families`],
      [/(\d+) SVG sets/g, `${stats.pieces} SVG sets`],
    ],
  },
  {
    file: 'docs/hexmaps.html',
    replacements: [
      // Style column of the games table, one row per registered generator
      ...hexGames.map(({ key }) => [
        new RegExp(`(<tr><td><code>${key}</code></td><td>[^<]*</td><td>[^<]*</td><td>)[^<]*(</td></tr>)`, 'g'),
        `$1${hexStyles[key].join(', ')}$2`,
      ]),
      // The style URL parameter accepts the union of what the generators offer
      [/(<tr><td><code>style<\/code><\/td><td>)(?:<code>[a-z]+<\/code>(?: \| )?)+(<\/td>)/g,
        `$1${allHexStyles.map(st => `<code>${st}</code>`).join(' | ')}$2`],
      [/\d+ tile sets: [a-z0-9-]+(?:, [a-z0-9-]+)*\./g, `${stats.tiles} tile sets: ${tileSetIds.join(', ')}.`],
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
      // The playable families were written out by hand and said six, from a
      // time when there were six. Derived like every other count on the page.
      [/\b(Six|Seven|Eight|Nine|Ten|Eleven|Twelve|\d+) families \([^)]*\) are fully playable/g,
        `${stats.playableFamilies} families (${playableFamilies.map(f => (f === 'landlords-game' ? "the Landlord's Game" : f)).join(', ')}) are fully playable`],
      [/<strong>\d+ game variants<\/strong>/g, `<strong>${stats.boards} game variants</strong>`],
      [/<strong>\d+ families<\/strong>/g, `<strong>${stats.boardFamilies} families</strong>`],
      [/<strong>\d+ topology types<\/strong>/g, `<strong>${stats.uniqueTopologies} topology types</strong>`],
    ],
  },
  // Every topology page's variant count, from the board index, and a footer
  // that lists every topology page.
  ...topologyNames.map(t => ({
    file: `topologies/${t}/index.html`,
    replacements: [
      [/(data-stat="variants">)\d+(<)/g, `$1${stats.topoCounts[t] || 0}$2`],
      [/<h4 class="footer-heading">Topologies<\/h4>[\s\S]*?<\/div>/, `<h4 class="footer-heading">Topologies</h4>\n${topologyNames.map(n => `        <a href="../${n}/">${TOPOLOGY_LABELS[n] || n}</a>`).join('\n')}\n      </div>`],
    ],
  })),
  // Every family page's footer lists every family page.
  ...familyPages.pages.map(({ family }) => ({
    file: `families/${family}/index.html`,
    replacements: [[/<h4 class="footer-heading">Families<\/h4>[\s\S]*?<\/div>/, footerFamiliesColumn(familyPages.pages, '../', familyPages.counts)]],
  })),
  // Family pages: patch all dynamic stats
  ...playableFamilies.map(family => {
    const vp = variantPluginCounts[family] || 0
    const fo = frontmatterOnlyCounts[family] || 0
    const replacements = [
      [/(data-stat="variants">)\d+(<\/span>)/g, `$1${stats.familyCounts[family] || 0}$2`],
      [/(data-stat="variants">)\d+(<)/g, `$1${stats.familyCounts[family] || 0}$2`],
    ]
    if (vp > 0) {
      replacements.push(
        [/(data-stat="variant-plugins">)\d+(<\/span>)/g, `$1${vp}$2`],
        [/(data-stat="frontmatter-only">)\d+(<\/span>)/g, `$1${fo}$2`],
      )
    }
    return { file: `families/${family}/index.html`, replacements }
  }),
]

// A page already generated above (a family page, a docs page with its
// navigation) is patched as generated, not as it stands on disk, so the two
// passes compose instead of the later one undoing the earlier.
const pending = new Map(outputs.map((o, i) => [o.path, i]))
for (const { file, replacements } of htmlPatches) {
  const fullPath = resolve(file)
  const at = pending.get(file)
  if (at === undefined && !fs.existsSync(fullPath)) continue
  let html = at !== undefined ? outputs[at].content : fs.readFileSync(fullPath, 'utf-8')
  let changed = false
  for (const [pattern, replacement] of replacements) {
    const before = html
    html = html.replace(pattern, replacement)
    if (html !== before) changed = true
  }
  if (changed) {
    if (at !== undefined) outputs[at] = { path: file, content: html }
    else outputs.push({ path: file, content: html })
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
