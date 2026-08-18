#!/usr/bin/env node
// CI guard: flag game-specific knowledge in packages/ (outside plugins/).
// Enforces the principle: a new variant must be addable by writing a markdown
// file without editing anything in packages/.
//
// Allowlist format: 'file|snippet' where snippet is the first 50 chars of matched text.
// This survives line number changes from refactors. Use 'file:*' for entire files.
// New violations cause failure; removing allowlisted violations is always safe.

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, join, relative } from 'path'

const ROOT = import.meta.dirname ? resolve(import.meta.dirname, '..') : process.cwd()

function scanSourceFiles() {
  const results = []
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'test-helpers') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) results.push(full)
    }
  }
  walk(resolve(ROOT, 'packages'))
  return results.filter(f => !f.includes('/plugins/'))
}

function snippetKey(file, text) {
  return `${file}|${text.trim().slice(0, 50)}`
}

// Allowlist keyed on file|snippet (first 50 chars of matched line) or file:* for entire files.
// Grouped by package for readability.
const ALLOWLIST = new Set([
  // --- component-deck: deck files named after their game (self-registering, acceptable) ---
  'packages/component-deck/src/decks/bavarian-32.js:*',
  'packages/component-deck/src/decks/dominoes-28.js:*',
  'packages/component-deck/src/decks/hanafuda-48.js:*',
  'packages/component-deck/src/decks/mahjong-136.js:*',

  // --- hex-generators: generators named after their games (acceptable, no alternative) ---
  'packages/hex-generators/src/colony.js:*',
  'packages/hex-generators/src/talisman.js:*',

  // --- play: plugin imports and orchestration (architecture, not game knowledge) ---
  "packages/play/src/play.js|import { createGoPlugin } from '../../plugins/go/src/go",
  "packages/play/src/play.js|import { createReversiPlugin } from '../../plugins/rever",
  "packages/play/src/play.js|import { createDraughtsPlugin } from '../../plugins/drau",
  "packages/play/src/play.js|import { createShogiPlugin } from '../../plugins/shogi/s",
  "packages/play/src/play.js|import { createXiangqiPlugin } from '../../plugins/xiang",
  "packages/play/src/play.js|import { createChessPlugin } from '../../plugins/chess/s",
  "packages/play/src/play.js|chess: createChessPlugin,",
  "packages/play/src/play.js|draughts: createDraughtsPlugin,",
  "packages/play/src/play.js|go: createGoPlugin,",
  "packages/play/src/play.js|reversi: createReversiPlugin,",
  "packages/play/src/play.js|shogi: createShogiPlugin,",
  "packages/play/src/play.js|xiangqi: createXiangqiPlugin,",
  'packages/play/src/embed.js:*',
  "packages/play/src/sdk.js|if (family === 'go') {",
  'packages/play/src/variant-flags.js:*',

  // --- ai: evaluators contain piece values and game-specific heuristics (tier 2, needs registry) ---
  'packages/ai/src/evaluators.js:*',
  'packages/ai/src/simulator.js:*',
  'packages/ai/src/minimax.js:*',
  'packages/ai/src/mcts.js:*',
  'packages/ai/src/go-playout-policy.js:*',

  // --- render: FEN maps and owner dispatch (tier 2, partial fix done) ---
  'packages/render/src/render-engine.js:*',
  'packages/render/src/board-renderer.js:*',

  // --- schema: produce-layout has board generation logic (tier 2, needs consolidation) ---
  'packages/schema/src/produce-layout.js:*',
  "packages/schema/src/validate.js|message: 'engine.pieces must be either an artwork ",

  // --- topologies: render code and coordinate systems ---
  'packages/topologies/tableau/src/topology-tableau.js:*',
  "packages/topologies/grid/src/topology-grid.js|if (idStyle === 'go') return goId",

  // --- rule: piece-type discriminators in attack detection (architecture, not game data) ---
  "packages/rule/src/rules/attack-detection.js|if (!pConfig || pConfig.movement === 'pawn') {",
  "packages/rule/src/rules/attack-detection.js|if (pConfig.movement === 'pawn') {",

  // --- core: FEN comment (not logic) ---
  "packages/core/src/fen-runs.js|// FEN run-length encoding for chess-like board not",

  // --- other play: fen.js and serialise.js handle format conventions ---
  'packages/play/src/fen.js:*',
  'packages/play/src/serialise.js:*',

  // --- graph: stern-halma row widths (tier 2, hardcoded geometry) ---
  "packages/topologies/graph/src/topology-graph.js|const rowWidths = [1, 2, 3, 4, 13,",
])

export function checkLine(line, ruleName) {
  const rule = RULES.find(r => r.name === ruleName)
  if (!rule) return false
  if (rule.skipImports && /^\s*(import|\/\/|\/\*|\*)/.test(line)) return false
  return rule.regex.test(line)
}

export const RULES = [
  {
    name: 'game-names',
    description: 'Game/family names in non-plugin packages',
    regex: /\b(chess|go|shogi|xiangqi|surakarta|pachisi|tafl|mancala|backgammon|fanorona|alquerque|draughts|reversi|halma|morris|landlords|nyout|asalto|senet|talisman|colony|hanafuda|bavarian|mahjong|dominoes)\b/i,
    skipImports: true,
  },
  {
    name: 'variant-slug-branching',
    description: 'Branching on variant/family slug strings',
    regex: /\b(variant|slug|board|family)\s*===\s*['"]/,
    skipImports: false,
  },
  {
    name: 'owner-colour-prefix',
    description: 'Hardcoded owner/colour prefix maps (white/black as owner names)',
    regex: /===\s*['"](?:white|black)['"]/,
    skipImports: false,
    allowFiles: ['packages/render/src/recolour.js'],
  },
  {
    name: 'piece-name-literals',
    description: 'Piece type names in switch/case or === (not as defaults after || or ??)',
    regex: /(?:case\s+['"]|===\s*['"])(king|queen|rook|bishop|knight|pawn|stone|lance|silver|gold|advisor|cannon|elephant|horse)\b/,
    skipImports: false,
  },
  {
    name: 'magic-board-dimensions',
    description: 'Hardcoded board sizes',
    regex: /(?:rows|cols|size|board\.length)\s*[=!]==\s*(?:8|9|10|13|19|24|64|81|90)\b/,
    skipImports: false,
  },
  {
    name: 'fixed-length-data-arrays',
    description: 'Large numeric arrays (board geometry hardcoded)',
    regex: /\[\s*(?:\d+\s*,\s*){7,}\d+\s*\]/,
    skipImports: false,
    onlyPaths: ['packages/schema/src/', 'packages/topologies/'],
  },
]

function isAllowlisted(relPath, text) {
  if (ALLOWLIST.has(`${relPath}:*`)) return true
  if (ALLOWLIST.has(snippetKey(relPath, text))) return true
  return false
}

const isMain = import.meta.dirname && process.argv[1]?.endsWith('check-purity.mjs')

if (isMain) {
  const sourceFiles = scanSourceFiles()
  const findings = []

  for (const file of sourceFiles) {
    const relPath = relative(ROOT, file)
    const content = readFileSync(file, 'utf8')
    const lines = content.split('\n')

    for (const rule of RULES) {
      if (rule.onlyPaths && !rule.onlyPaths.some(p => relPath.startsWith(p))) continue
      if (rule.allowFiles && rule.allowFiles.some(p => relPath === p)) continue

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (rule.skipImports && /^\s*(import|\/\/|\/\*|\*)/.test(line)) continue
        if (rule.regex.test(line)) {
          if (!isAllowlisted(relPath, line)) {
            findings.push({ rule: rule.name, file: relPath, line: i + 1, text: line.trim() })
          }
        }
      }
    }
  }

  if (findings.length > 0) {
    console.error(`Purity check FAILED: ${findings.length} violation(s) outside allowlist\n`)
    for (const f of findings) {
      console.error(`  [${f.rule}] ${f.file}:${f.line}`)
      console.error(`    ${f.text.slice(0, 80)}`)
    }
    const example = findings[0]
    console.error(`\nTo allowlist, add to ALLOWLIST in scripts/check-purity.mjs:`)
    console.error(`  "${snippetKey(example.file, example.text)}",`)
    process.exit(1)
  }

  const FILE_FLOOR = 130
  const ALLOWLIST_CEILING = 45

  if (sourceFiles.length < FILE_FLOOR) {
    console.error(`Purity check FAILED: file count (${sourceFiles.length}) below floor (${FILE_FLOOR}). Was a package removed?`)
    process.exit(1)
  }

  if (ALLOWLIST.size > ALLOWLIST_CEILING) {
    console.error(`Purity check FAILED: allowlist grew to ${ALLOWLIST.size} (ceiling is ${ALLOWLIST_CEILING}). Remove violations, don't allowlist more.`)
    process.exit(1)
  }

  console.log(`Purity check: OK (${sourceFiles.length} files, ${ALLOWLIST.size}/${ALLOWLIST_CEILING} allowlisted)`)
}
