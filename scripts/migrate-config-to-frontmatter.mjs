#!/usr/bin/env node
/**
 * Codemod: migrate config-only chess variant registry entries into .md frontmatter.
 *
 * For each config-only registry entry:
 * 1. Read its keys (setup, pieces, vocabulary, castling, etc.)
 * 2. Merge into the corresponding .md engine: block
 * 3. Report what was written
 *
 * Does NOT delete JS entries — that's a separate manual step after verification.
 * Run: node scripts/migrate-config-to-frontmatter.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const ENGINE_ROOT = process.cwd()
const RULES_ROOT = join(ENGINE_ROOT, '..', 'moddable-rules', 'games', 'chess', 'content', 'variants')

// Keys that are presentation/structural, NOT plugin config
const SKIP_KEYS = new Set([
  'key', 'label', 'title', 'group', 'description', 'rule', 'board',
  'extends', 'hidden', 'playerNames', 'definition', 'rows', 'cols',
  'size', 'notation', 'topology', 'players', 'openingBook', 'render',
])

// Keys already handled by topology in frontmatter
const TOPOLOGY_HANDLED = new Set(['rows', 'cols', 'size'])

// Import the registry
const chess = await import('../packages/plugins/chess/index.js')
const { getVariantConfig, getVariantKeys } = await import('../packages/play/src/variant-registry.js')

function containsFunction(val) {
  if (typeof val === 'function') return true
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
  return Object.values(val).some(containsFunction)
}

function toYaml(value, indent = 4) {
  const pad = ' '.repeat(indent)
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value.toString()
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'string') {
    if (/^[\w-]+$/.test(value)) return value
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    // Short arrays on one line
    const simple = value.every(v => typeof v !== 'object' || v === null)
    if (simple) {
      return '[' + value.map(v => typeof v === 'string' ? (/^[\w-]+$/.test(v) ? v : JSON.stringify(v)) : JSON.stringify(v)).join(', ') + ']'
    }
    // Complex arrays — inline JSON-ish
    return '[' + value.map(v => JSON.stringify(v)).join(', ') + ']'
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    // Single-level flat objects: inline
    const allSimple = entries.every(([, v]) => typeof v !== 'object' || v === null || Array.isArray(v))
    if (allSimple && entries.length <= 3) {
      const inner = entries.map(([k, v]) => `${k}: ${toYaml(v, indent + 2)}`).join(', ')
      return `{${inner}}`
    }
    // Multi-level: expand
    let result = ''
    for (const [k, v] of entries) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        // Nested object — check depth
        const subEntries = Object.entries(v)
        const subSimple = subEntries.every(([, sv]) => typeof sv !== 'object' || sv === null || Array.isArray(sv))
        if (subSimple && subEntries.length <= 4) {
          const inner = subEntries.map(([sk, sv]) => `${sk}: ${toYaml(sv, indent + 2)}`).join(', ')
          result += `\n${pad}${k}: {${inner}}`
        } else {
          result += `\n${pad}${k}:`
          for (const [sk, sv] of subEntries) {
            result += `\n${pad}  ${sk}: ${toYaml(sv, indent + 4)}`
          }
        }
      } else {
        result += `\n${pad}${k}: ${toYaml(v, indent + 2)}`
      }
    }
    return result
  }
  return JSON.stringify(value)
}

function camelToKebab(str) {
  return str.replace(/([a-z\d])([A-Z])/g, '$1-$2').toLowerCase()
}

const keys = getVariantKeys('chess')
const migrated = []
const skipped = []
const errors = []

for (const key of keys) {
  if (key === 'standard') continue
  const config = getVariantConfig('chess', key)
  if (containsFunction(config)) continue

  const slug = camelToKebab(key)
  const mdPath = join(RULES_ROOT, `${slug}.md`)

  if (!existsSync(mdPath)) {
    skipped.push({ key, reason: `${slug}.md not found` })
    continue
  }

  // Extract plugin config keys
  const pluginKeys = {}
  for (const [k, v] of Object.entries(config)) {
    if (SKIP_KEYS.has(k)) continue
    if (TOPOLOGY_HANDLED.has(k)) continue
    pluginKeys[k] = v
  }

  if (Object.keys(pluginKeys).length === 0) {
    skipped.push({ key, reason: 'no plugin config to migrate' })
    continue
  }

  // Read the .md file
  const md = readFileSync(mdPath, 'utf8')

  // Find the engine: block end (the line before --- or before published:)
  const lines = md.split('\n')
  let engineEnd = -1
  let inEngine = false
  let engineIndent = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^engine:/)) {
      inEngine = true
      engineIndent = 2
      continue
    }
    if (inEngine) {
      // Still in engine block if indented
      if (lines[i].match(/^\s/) && !lines[i].match(/^[a-z]/)) {
        engineEnd = i
      } else {
        break
      }
    }
  }

  if (engineEnd === -1) {
    errors.push({ key, reason: 'could not find engine: block end' })
    continue
  }

  // Check which keys already exist in frontmatter
  const engineBlock = lines.slice(0, engineEnd + 1).join('\n')
  const alreadyPresent = new Set()
  for (const k of Object.keys(pluginKeys)) {
    // Simple check: does the key appear at the right indent level?
    const pattern = new RegExp(`^  ${k}:`, 'm')
    if (pattern.test(engineBlock)) {
      alreadyPresent.add(k)
    }
  }

  // Build YAML lines to insert
  const toInsert = []
  for (const [k, v] of Object.entries(pluginKeys)) {
    if (alreadyPresent.has(k)) continue
    const yamlVal = toYaml(v, 4)
    if (yamlVal.startsWith('\n')) {
      // Multi-line value
      toInsert.push(`  ${k}:${yamlVal}`)
    } else {
      toInsert.push(`  ${k}: ${yamlVal}`)
    }
  }

  if (toInsert.length === 0) {
    skipped.push({ key, reason: 'all keys already in frontmatter' })
    continue
  }

  // Insert after the last engine line
  const newLines = [
    ...lines.slice(0, engineEnd + 1),
    ...toInsert,
    ...lines.slice(engineEnd + 1),
  ]

  writeFileSync(mdPath, newLines.join('\n'))
  migrated.push({ key, slug, keys: Object.keys(pluginKeys).filter(k => !alreadyPresent.has(k)) })
}

console.log(`\n=== Migration complete ===`)
console.log(`Migrated: ${migrated.length}`)
for (const m of migrated) {
  console.log(`  ${m.key} → ${m.slug}.md: ${m.keys.join(', ')}`)
}
console.log(`\nSkipped: ${skipped.length}`)
for (const s of skipped) {
  console.log(`  ${s.key}: ${s.reason}`)
}
if (errors.length) {
  console.log(`\nErrors: ${errors.length}`)
  for (const e of errors) {
    console.log(`  ${e.key}: ${e.reason}`)
  }
}
