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

const GAME_NAMES = /\b(chess|shogi|xiangqi|mancala|backgammon|draughts|reversi|halma|morris|pachisi|tafl|fanorona|alquerque|senet|talisman)\b/i

const allFiles = PACKAGES.flatMap(pkg => srcFiles(pkg))

const ALLOWLIST = new Set([
  'packages/play/src/embed.js|chess',
  'packages/play/src/sdk.js|go',
  'packages/schema/src/validate.js|chess',
])

describe('no game knowledge in non-plugin packages', () => {
  test('no game-family names in source (excluding composition roots and comments)', () => {
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
})
