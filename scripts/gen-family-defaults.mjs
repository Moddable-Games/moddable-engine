#!/usr/bin/env node
/**
 * Generate play/family-defaults.json from moddable-rules frontmatter.
 *
 * For each family with a plugin, reads the rulebook (topology, players) and
 * the default variant (order: 1) to extract the canonical setup and plugin
 * config. Replaces the hardcoded DEFAULT_DEFINITIONS map in play.js.
 *
 * Usage:
 *   NODE_OPTIONS='--experimental-vm-modules' node scripts/gen-family-defaults.mjs
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const OUT = process.env.DEFAULTS_OUT || join(process.cwd(), 'play', 'family-defaults.json')

const FAMILIES = ['chess', 'go', 'draughts', 'shogi', 'xiangqi', 'reversi']

function findDefaultVariant(family) {
  const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
  if (!existsSync(variantsDir)) return null

  const standardPath = join(variantsDir, 'standard.md')
  if (existsSync(standardPath)) {
    const text = readFileSync(standardPath, 'utf8')
    const { meta } = parseFrontmatter(text)
    return { file: 'standard.md', meta }
  }

  const files = readdirSync(variantsDir).filter(f => f.endsWith('.md'))
  let bestFile = null
  let bestOrder = Infinity

  for (const file of files) {
    const text = readFileSync(join(variantsDir, file), 'utf8')
    const { meta } = parseFrontmatter(text)
    const order = meta.order !== undefined ? Number(meta.order) : 999
    if (order < bestOrder) {
      bestOrder = order
      bestFile = { file, meta }
    }
  }
  return bestFile
}

const defaults = {}

for (const family of FAMILIES) {
  const rulebookPath = join(RULES_ROOT, family, 'content', 'rulebook.md')
  if (!existsSync(rulebookPath)) {
    console.warn(`  ${family}: no rulebook found, skipping`)
    continue
  }

  const { meta: rulebookFm } = parseFrontmatter(readFileSync(rulebookPath, 'utf8'))
  const engine = rulebookFm.engine || {}
  const defaultVariant = findDefaultVariant(family)

  if (!defaultVariant) {
    console.warn(`  ${family}: no variants found, skipping`)
    continue
  }

  const { meta: variantFm } = defaultVariant
  const variantEngine = variantFm.engine || {}
  const topology = variantEngine.topology || engine.topology || {}
  const players = variantEngine.players || engine.players || ['white', 'black']

  const pluginBlock = variantEngine.plugins?.[family] || {}
  const setup = pluginBlock.setup || variantEngine.setup

  const pluginConfig = { ...pluginBlock }
  if (setup && !pluginConfig.setup) pluginConfig.setup = setup

  defaults[family] = {
    default: {
      title: variantFm.title || family,
      slug: variantFm.slug || defaultVariant.file.replace('.md', ''),
      parent: family,
      engine: {
        topology,
        players,
        plugins: { [family]: pluginConfig },
      },
    },
  }

  console.log(`  ${family}: ${defaults[family].default.title} (${defaults[family].default.slug})`)
}

writeFileSync(OUT, JSON.stringify(defaults, null, 2) + '\n')
console.log(`\nWrote ${OUT}`)
