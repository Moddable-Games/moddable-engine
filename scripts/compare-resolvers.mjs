#!/usr/bin/env node
// Throwaway: compare the three frontmatter resolution paths across all 177 variants.
// Reports which variants disagree and what keys differ.

import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { resolveFromDisk, setRulesReader } from '../packages/play/src/play.js'
import '../packages/play/test-helpers/setup-rules-reader.js'
import '../packages/plugins/chess/index.js'
import '../packages/plugins/go/index.js'
import '../packages/plugins/draughts/index.js'
import '../packages/plugins/xiangqi/index.js'
import '../packages/plugins/shogi/index.js'
import '../packages/plugins/reversi/index.js'
import { listVariants, getRegisteredFamilies } from '../packages/play/src/variant-registry.js'

const RULES_ROOT = resolve(import.meta.dirname, '..', '..', 'moddable-rules', 'games')

function readRule(family, slug) {
  const path = slug === 'rulebook'
    ? join(RULES_ROOT, family, 'content', 'rulebook.md')
    : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`)
  return readFileSync(path, 'utf8')
}

// Path 1: loadVariant (no extends) — reimplemented without fetch
function resolvePath1(family, slug) {
  let familyMd, variantMd
  try { familyMd = readRule(family, 'rulebook') } catch { return null }
  try { variantMd = readRule(family, slug) } catch { return null }
  if (!variantMd) return null

  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = parseFrontmatter(variantMd).meta || {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || variantFm.slug || '' } },
  })
  return resolved
}

// Path 2: resolveVariantBoard (one level extends) — reimplemented without fetch
function resolvePath2(family, slug) {
  let familyMd, variantMd
  try { familyMd = readRule(family, 'rulebook') } catch { return null }
  try { variantMd = readRule(family, slug) } catch { variantMd = '' }
  if (!variantMd && slug !== 'standard') return null

  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = variantMd ? (parseFrontmatter(variantMd).meta || {}) : {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || '' } },
  })

  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock?.extends) {
    const parentSlug = pluginBlock.extends
    let parentMd
    try { parentMd = readRule(family, parentSlug) } catch { parentMd = '' }
    if (parentMd) {
      const parentFm = parseFrontmatter(parentMd).meta || {}
      const parentSurface = resolveSurface(parentFm.engine?.surface || familyFm.engine?.surface)
      const { resolved: parentResolved } = cascadeResolve({
        surface: parentSurface,
        family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
        variant: { engine: parentFm.engine || {}, meta: { label: parentFm.title || '' } },
      })
      const parentPlugin = parentResolved.plugins?.[family] || {}
      const merged = { ...parentPlugin, ...pluginBlock }
      delete merged.extends
      resolved.plugins[family] = merged
    }
  }

  return resolved
}

// Path 3: resolveFromDisk (recursive extends) — already set up via import
function resolvePath3(family, slug) {
  return resolveFromDisk(family, slug)
}

function sortedStringify(obj) {
  return JSON.stringify(obj, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
    }
    return v
  }, 2)
}

function diffKeys(a, b) {
  if (!a || !b) return ['(one is null)']
  const aStr = sortedStringify(a)
  const bStr = sortedStringify(b)
  if (aStr === bStr) return []

  const diffs = []
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of allKeys) {
    const av = JSON.stringify(a[k])
    const bv = JSON.stringify(b[k])
    if (av !== bv) diffs.push(k)
  }
  return diffs
}

// Run comparison
const families = getRegisteredFamilies()
let totalVariants = 0
let allAgree = 0
const disagreements = []

for (const family of families) {
  const variants = listVariants(family)
  for (const v of variants) {
    totalVariants++
    const slug = v.slug || v.key
    const r1 = resolvePath1(family, slug)
    const r2 = resolvePath2(family, slug)
    const r3 = resolvePath3(family, slug)

    if (!r1 && !r2 && !r3) continue

    const s1 = sortedStringify(r1)
    const s2 = sortedStringify(r2)
    const s3 = sortedStringify(r3)

    if (s1 === s2 && s2 === s3) {
      allAgree++
      continue
    }

    const entry = { variant: `${family}/${v.key}`, diffs: [] }
    const d12 = diffKeys(r1, r2)
    const d13 = diffKeys(r1, r3)
    const d23 = diffKeys(r2, r3)
    if (d12.length > 0) entry.diffs.push({ pair: 'path1≠path2', keys: d12 })
    if (d13.length > 0) entry.diffs.push({ pair: 'path1≠path3', keys: d13 })
    if (d23.length > 0) entry.diffs.push({ pair: 'path2≠path3', keys: d23 })
    disagreements.push(entry)
  }
}

console.log(`\n=== Frontmatter Resolver Comparison ===`)
console.log(`Total variants: ${totalVariants}`)
console.log(`All three agree: ${allAgree}`)
console.log(`Disagreements: ${disagreements.length}\n`)

if (disagreements.length > 0) {
  console.log('--- Variants where paths disagree ---\n')
  for (const d of disagreements) {
    console.log(`${d.variant}:`)
    for (const diff of d.diffs) {
      console.log(`  ${diff.pair}: [${diff.keys.join(', ')}]`)
    }
  }
}

// Also report: how many use extends?
let extendsCount = 0
let multiExtends = 0
for (const family of families) {
  for (const v of listVariants(family)) {
    const slug = v.slug || v.key
    let md
    try { md = readRule(family, slug) } catch { continue }
    const fm = parseFrontmatter(md).meta || {}
    const pluginBlock = fm.engine?.plugins?.[family]
    if (pluginBlock?.extends) {
      extendsCount++
      // Check if the parent also extends
      try {
        const parentMd = readRule(family, pluginBlock.extends)
        const parentFm = parseFrontmatter(parentMd).meta || {}
        if (parentFm.engine?.plugins?.[family]?.extends) multiExtends++
      } catch {}
    }
  }
}
console.log(`\n--- extends usage ---`)
console.log(`Variants declaring extends: ${extendsCount}`)
console.log(`Multi-level extends (parent also extends): ${multiExtends}`)
