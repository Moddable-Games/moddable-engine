#!/usr/bin/env node
/**
 * Generate play/playability-manifest.json
 *
 * Imports all 5 plugin families, runs a simplified playability check per variant
 * (instantiate + up to 200 random plies), and writes the manifest for the play
 * page variant picker.
 *
 * Usage:
 *   NODE_OPTIONS='--experimental-vm-modules' node scripts/gen-playability-manifest.mjs
 */

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Wire the rules reader before plugin registration
import '../packages/play/test-helpers/setup-rules-reader.js'

// Side-effect registration of all plugin families
// Registration lives in the composition root, and getFamilies() below reads
// from it, so the plugin list is not restated here either.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGameForFamily, getFamilies } from '../packages/play/src/play.js'
import { listVariants, getVariantConfig, getVariantKeys } from '../packages/play/src/variant-registry.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { probePicker } from './lib/probe-rng.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT = process.env.MANIFEST_OUT || resolve(__dirname, '..', 'play', 'playability-manifest.json')

// Derived from the families that have a plugin, not restated. A hardcoded list
// here is worse than the one in gen-family-defaults.mjs was: this manifest is
// what the site offers as playable, so a family missing from it ships in the
// corpus and never appears. Mancala's six variants were invisible this way.
const FAMILIES = getFamilies().slice().sort()
const MAX_PLIES = 200
const MAX_CONTINUATION = 50
const MAX_PLACEMENT = 100

// The play page's family picker used to render a six-name literal in
// js/play-shared.js, so hex, mancala, morris and landlords-game were playable
// and invisible. The picker now reads the manifest, which means the manifest
// has to carry a display name for the family as well as for the variant.
//
// Source of truth is the family rulebook's own frontmatter: `label` if it
// declares one, otherwise its `title` with the shared " - Official Rulebook"
// suffix removed, otherwise the slug humanized.
function familyLabel(family, rulesRoot) {
  try {
    const text = readFileSync(join(rulesRoot, family, 'content', 'rulebook.md'), 'utf8')
    const { meta } = parseFrontmatter(text)
    if (meta.label) return meta.label
    if (meta.title) {
      const trimmed = String(meta.title).replace(/\s*[-\u2013\u2014]\s*Official Rulebook\s*$/i, '').trim()
      if (trimmed) return trimmed
    }
  } catch { /* no rulebook */ }
  return humanize(family)
}

function humanize(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Picks are reproducible per variant. See scripts/lib/probe-rng.mjs for why.
function runGame(family, variantKey) {
  const pick = probePicker(family, variantKey)
  try {
    const game = createGameForFamily(family, { variant: variantKey })

    // Handle placement phase (some chess variants)
    const state = game.getState()
    const slice = state?.slice || state
    if (slice && (slice._phase === 'placement' || slice.phase === 'placement')) {
      let placementMoves = 0
      while (placementMoves < MAX_PLACEMENT) {
        const s = game.getState()?.slice || game.getState()
        if (s._phase !== 'placement' && s.phase !== 'placement') break
        const moves = game.getLegalMoves()
        if (moves.length === 0) break
        game.applyMove(pick(moves))
        placementMoves++
      }
      const afterPlacement = game.getState()?.slice || game.getState()
      if (afterPlacement._phase === 'placement' || afterPlacement.phase === 'placement') {
        return false // placement deadlock
      }
    }

    // Play up to MAX_PLIES random moves
    let plies = 0
    while (plies < MAX_PLIES) {
      const moves = game.getLegalMoves()
      if (moves.length === 0) return true // terminal (no moves = game over)

      const move = pick(moves)
      const res = game.applyMove(move)

      if (!res || !res.ok) return false // move rejected = broken
      plies++

      if (res.winner) return true // terminal (winner found)

      // Handle continueTurn (draughts chain captures, multi-action turns)
      if (res.continueTurn) {
        let subPlies = 0
        while (subPlies < MAX_CONTINUATION) {
          const subMoves = game.getLegalMoves()
          if (subMoves.length === 0) return true // no moves mid-turn = terminal
          const sub = game.applyMove(pick(subMoves))
          subPlies++
          if (!sub || !sub.ok) return false
          if (sub.winner) return true
          if (!sub.continueTurn) break
        }
        if (subPlies >= MAX_CONTINUATION) return false
      }
    }

    // Timeout at MAX_PLIES: game is still playable, just a long game
    return true
  } catch (e) {
    return false // instantiation or runtime error
  }
}

// --- Main ---

const manifest = []
let totalVariants = 0
let totalPlayable = 0

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')

for (const family of FAMILIES) {
  const seen = new Set()
  const allVariants = []

  // Registry variants
  const registryVariants = listVariants(family)
  for (const v of registryVariants) {
    seen.add(v.key)
    if (v.slug) seen.add(v.slug)
    allVariants.push({ key: v.key, slug: v.slug, label: v.label, group: v.group })
  }

  // Frontmatter variants with playable: true not already in registry
  try {
    const dir = join(RULES_ROOT, family, 'content', 'variants')
    const files = readdirSync(dir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const slug = file.replace('.md', '')
      const text = readFileSync(join(dir, file), 'utf8')
      const { meta } = parseFrontmatter(text)
      const key = meta.key || slug
      if (seen.has(key) || seen.has(slug)) continue
      if (meta.playable !== true) continue
      seen.add(key)
      seen.add(slug)
      allVariants.push({ key, slug, label: meta.title || humanize(slug), group: meta.group || 'Other' })
    }
  } catch { /* no rules dir */ }

  let familyPlayable = 0
  const label = familyLabel(family, RULES_ROOT)
  process.stdout.write(`${family}: ${allVariants.length} variants... `)

  for (const v of allVariants) {
    const playable = runGame(family, v.slug || v.key)
    if (playable) familyPlayable++

    const entry = {
      family,
      familyLabel: label,
      variant: v.slug || v.key,
      key: v.key,
      label: v.label === v.key ? humanize(v.key) : v.label,
      group: v.group,
      playable,
    }
    manifest.push(entry)
  }

  totalVariants += allVariants.length
  totalPlayable += familyPlayable
  console.log(`${familyPlayable}/${allVariants.length} playable`)
}

// Sort by family then variant key
manifest.sort((a, b) => {
  if (a.family !== b.family) return a.family.localeCompare(b.family)
  return a.variant.localeCompare(b.variant)
})

writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + '\n')

console.log(`\nWrote ${OUTPUT}`)
console.log(`Total: ${totalPlayable}/${totalVariants} playable`)
