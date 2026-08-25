import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../..')

function collectFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      files.push(...collectFiles(full))
    } else if (entry.name.endsWith('.js')) {
      files.push(full)
    }
  }
  return files
}

function srcFiles(pkg) {
  const srcDir = resolve(root, 'packages', pkg, 'src')
  try { return collectFiles(srcDir) } catch { return [] }
}

const COMPOSITION_ROOTS = new Set([
  'packages/play/src/bootstrap-plugins.js',
  'packages/play/src/play.js',
])

const PACKAGES = [
  'core', 'topologies/grid', 'topologies/hex', 'topologies/track',
  'topologies/pit', 'topologies/graph', 'topologies/tableau',
  'piece-behaviour', 'rule', 'render', 'surface', 'schema', 'game',
  'play', 'board-theme', 'piece-theme', 'component-deck', 'component-dice',
  'rpg', 'ai',
]

// The family list is read from the corpus, not restated here. The literal it
// replaced named 15 families and covered 13 of the 51 the corpus actually
// ships, so go, mahjong, surakarta, landlords-game, royal-ur, dou-shou-qi,
// nyout, agon, asalto, lattaque, stern-halma and 27 others were invisible to
// it - and two names in the list, alquerque and talisman, were not families at
// all. A guard whose scope is a hand-maintained literal stops covering the
// project the moment someone adds a game.
const RULES_ROOT = process.env.MODDABLE_RULES_DIR
  || resolve(root, '..', 'moddable-rules', 'games')

// Words that are also ordinary code identifiers or English. Matching these
// would drown the guard in false positives, which is the failure mode it is
// meant to avoid.
const AMBIGUOUS = new Set(['_shared', 'hex', 'mongo', 'nukes', 'cairn', 'knave', 'go'])

function corpusFamilies() {
  try {
    return readdirSync(RULES_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => !AMBIGUOUS.has(name))
  } catch {
    return []
  }
}

const FAMILIES = corpusFamilies()
const GAME_NAMES = FAMILIES.length
  ? new RegExp(`\\b(${FAMILIES.map(f => f.replace(/-/g, '[- ]?')).join('|')})\\b`, 'i')
  : null

const allFiles = PACKAGES.flatMap(pkg => srcFiles(pkg))

// Each entry is `file|matched-name`, with the reason it is allowed.
//
// The component-deck entries are not game knowledge leaking into core: a deck
// definition's whole purpose is to name the deck it defines, the same way a
// font file names its typeface. They are components a game composes, not a
// game the engine knows about.
const ALLOWLIST = new Set([
  'packages/play/src/embed.js|chess',                       // default family for a bare embed URL
  'packages/schema/src/validate.js|chess',                  // example text inside an error message
  'packages/component-deck/src/decks/bavarian-32.js|bavarian-32',
  'packages/component-deck/src/decks/bavarian-32.js|bavarian 32',
  'packages/component-deck/src/decks/dominoes-28.js|double-six dominoes',
  'packages/component-deck/src/decks/mahjong-136.js|mahjong',
  'packages/component-deck/src/decks/standard-52.js|standard-52',
  'packages/component-deck/src/decks/standard-52.js|standard 52',
  'packages/component-deck/src/decks/standard-dice.js|standard-dice',
  'packages/component-deck/src/decks/standard-dice.js|standard dice',
  'packages/component-deck/src/standard-52.js|standard-52',
  'packages/render/src/render-tableau.js|standard-dice',    // deck-type fallback, engine#140
  'packages/topologies/tableau/src/topology-tableau.js|mahjong', // prose sniff in dead parseBoard, engine#140
])

// Shrink-only. Two of these are real leaks pending engine#140, the rest are
// component identities. Deleting one is progress; adding one is a regression.
const ALLOWLIST_CEILING = 14

describe('no game knowledge in non-plugin packages', () => {
  // A guard that scans nothing passes. Without the corpus this test would
  // silently become a no-op, which is exactly the failure it exists to prevent.
  test('the corpus family list was found', () => {
    expect(FAMILIES.length).toBeGreaterThan(30)
  })

  test('no game-family names in source (excluding composition roots and comments)', () => {
    if (!GAME_NAMES) throw new Error(`No corpus families found at ${RULES_ROOT}`)
    const violations = []

    for (const file of allFiles) {
      const rel = relative(root, file)
      if (COMPOSITION_ROOTS.has(rel)) continue

      const source = readFileSync(file, 'utf8')
      const lines = source.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.trimStart().startsWith('//')) continue
        if (line.trimStart().startsWith('*')) continue
        if (line.includes('import ') && line.includes('from ')) continue

        const match = line.match(GAME_NAMES)
        if (!match) continue

        const key = `${rel}|${match[0].toLowerCase()}`
        if (ALLOWLIST.has(key)) continue

        violations.push(`${rel}:${i + 1} — "${match[0]}"`)
      }
    }

    expect(violations).toEqual([])
  })

  test('the allowlist only shrinks', () => {
    expect(ALLOWLIST.size).toBeLessThanOrEqual(ALLOWLIST_CEILING)
  })
})
