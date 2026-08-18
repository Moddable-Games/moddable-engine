#!/usr/bin/env node
// CI guard: flag game-specific knowledge in packages/ (outside plugins/).
// Enforces the principle: a new variant must be addable by writing a markdown
// file without editing anything in packages/.
//
// Uses an allowlist of known violations (file:line) that shrinks over time.
// New violations cause failure; removing allowlisted violations is always safe.

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, join, relative } from 'path'

const ROOT = resolve(import.meta.dirname, '..')

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

const ALLOWLIST = new Set([
  // Rule 1: deck data files named after their game (self-registering)
  'packages/component-deck/src/decks/bavarian-32.js:*',
  'packages/component-deck/src/decks/dominoes-28.js:*',
  'packages/component-deck/src/decks/hanafuda-48.js:*',
  'packages/component-deck/src/decks/mahjong-136.js:*',
  // Rule 1: game names in play/ orchestration layer (issue #133 tier 1 items 9-12)
  'packages/play/src/play.js:23',
  'packages/play/src/play.js:24',
  'packages/play/src/play.js:25',
  'packages/play/src/play.js:26',
  'packages/play/src/play.js:27',
  'packages/play/src/play.js:28',
  'packages/play/src/play.js:29',
  'packages/play/src/play.js:30',
  'packages/play/src/play.js:31',
  'packages/play/src/play.js:32',
  'packages/play/src/play.js:33',
  'packages/play/src/play.js:34',
  'packages/play/src/play.js:35',
  'packages/play/src/play.js:36',
  'packages/play/src/play.js:37',
  'packages/play/src/play.js:38',
  'packages/play/src/play.js:39',
  'packages/play/src/interaction.js:130',
  'packages/play/src/interaction.js:131',
  'packages/play/src/interaction.js:132',
  'packages/play/src/interaction.js:133',
  'packages/play/src/interaction.js:134',
  'packages/play/src/interaction.js:135',
  'packages/play/src/interaction.js:136',
  'packages/play/src/interaction.js:137',
  'packages/play/src/interaction.js:138',
  'packages/play/src/interaction.js:139',
  'packages/play/src/interaction.js:140',
  'packages/play/src/interaction.js:141',
  'packages/play/src/sdk.js:17',
  'packages/play/src/sdk.js:78',
  'packages/play/src/game-controller.js:264',
  'packages/play/src/embed.js:5',
  'packages/play/src/embed.js:6',
  'packages/play/src/embed.js:7',
  'packages/play/src/embed.js:8',
  'packages/play/src/embed.js:9',
  'packages/play/src/embed.js:10',
  'packages/play/src/embed.js:11',
  'packages/play/src/embed.js:12',
  'packages/play/src/embed.js:13',
  'packages/play/src/embed.js:14',
  'packages/play/src/embed.js:15',
  'packages/play/src/embed.js:16',
  'packages/play/src/embed.js:17',
  // Rule 1: variant-flags (issue #133 tier 1 item 12)
  'packages/play/src/variant-flags.js:*',
  // Rule 1+4+5: AI (issue #133 tier 1 item 11)
  'packages/ai/src/evaluators.js:*',
  'packages/ai/src/simulator.js:*',
  'packages/ai/src/minimax.js:*',
  'packages/ai/src/mcts.js:*',
  // Rule 1: hex generators named after their games
  'packages/hex-generators/src/colony.js:*',
  'packages/hex-generators/src/talisman.js:*',
  // Rule 1: render-engine (issue #133 tier 1 item 13, tier 2)
  'packages/render/src/render-engine.js:*',
  // Rule 1: produce-layout (issue #133 tier 1 items 2-8)
  'packages/schema/src/produce-layout.js:*',
  // Rule 1: render-tableau (issue #133 tier 1 item 3)
  'packages/topologies/tableau/src/render-tableau.js:*',
  'packages/topologies/tableau/src/topology-tableau.js:*',
  // Rule 1: fen.js shogi detection, serialise.js fen4
  'packages/play/src/fen.js:*',
  'packages/play/src/serialise.js:*',
  // Rule 1: topology-grid go coordinate style
  'packages/topologies/grid/src/topology-grid.js:602',
  // Rule 1: fen-runs.js (comment only, no logic)
  'packages/core/src/fen-runs.js:1',
  // Rule 1: embed.js default family fallback
  'packages/play/src/embed.js:25',
  // Rule 3: board-renderer owner colour dispatch (issue #133 tier 1 item 13)
  'packages/render/src/board-renderer.js:*',
  // Rule 4: attack-detection uses 'pawn' as movement-type discriminator
  'packages/rule/src/rules/attack-detection.js:9',
  'packages/rule/src/rules/attack-detection.js:53',
  // Rule 6: stern-halma rowWidths (issue #133 tier 1 item 4)
  'packages/topologies/graph/src/topology-graph.js:461',
])

const RULES = [
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
        const loc = `${relPath}:${i + 1}`
        const wildcardLoc = `${relPath}:*`
        if (!ALLOWLIST.has(loc) && !ALLOWLIST.has(wildcardLoc)) {
          findings.push({ rule: rule.name, file: relPath, line: i + 1, text: line.trim().slice(0, 80) })
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`Purity check FAILED: ${findings.length} violation(s) outside allowlist\n`)
  for (const f of findings) {
    console.error(`  [${f.rule}] ${f.file}:${f.line}`)
    console.error(`    ${f.text}`)
  }
  console.error(`\nTo allowlist a finding, add '${findings[0].file}:${findings[0].line}' to ALLOWLIST in scripts/check-purity.mjs`)
  process.exit(1)
}

const FILE_FLOOR = 130
const ALLOWLIST_CEILING = 69

if (sourceFiles.length < FILE_FLOOR) {
  console.error(`Purity check FAILED: file count (${sourceFiles.length}) below floor (${FILE_FLOOR}). Was a package removed without updating the guard?`)
  process.exit(1)
}

if (ALLOWLIST.size > ALLOWLIST_CEILING) {
  console.error(`Purity check FAILED: allowlist grew to ${ALLOWLIST.size} (ceiling is ${ALLOWLIST_CEILING}). Remove violations, don't allowlist more.`)
  process.exit(1)
}

console.log(`Purity check: OK (${sourceFiles.length} files scanned, ${ALLOWLIST.size}/${ALLOWLIST_CEILING} allowlisted)`)
