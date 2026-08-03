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

// Side-effect registration of all plugin families
import '../packages/plugins/chess/index.js'
import '../packages/plugins/go/index.js'
import '../packages/plugins/draughts/index.js'
import '../packages/plugins/xiangqi/index.js'
import '../packages/plugins/shogi/index.js'

import { createGameForFamily } from '../packages/play/src/play.js'
import { listVariants, getVariantConfig } from '../packages/play/src/variant-registry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT = resolve(__dirname, '..', 'play', 'playability-manifest.json')

const FAMILIES = ['chess', 'go', 'draughts', 'xiangqi', 'shogi']
const MAX_PLIES = 200
const MAX_CONTINUATION = 50
const MAX_PLACEMENT = 100

function humanize(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function runGame(family, variantKey) {
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
        game.applyMove(moves[Math.floor(Math.random() * moves.length)])
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

      const move = moves[Math.floor(Math.random() * moves.length)]
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
          const sub = game.applyMove(subMoves[Math.floor(Math.random() * subMoves.length)])
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

for (const family of FAMILIES) {
  const variants = listVariants(family)
  let familyPlayable = 0

  process.stdout.write(`${family}: ${variants.length} variants... `)

  for (const v of variants) {
    const key = v.key
    const playable = runGame(family, key)
    if (playable) familyPlayable++

    manifest.push({
      family,
      variant: key,
      label: v.label === key ? humanize(key) : v.label,
      group: v.group,
      playable,
    })
  }

  totalVariants += variants.length
  totalPlayable += familyPlayable
  console.log(`${familyPlayable}/${variants.length} playable`)
}

// Sort by family then variant key
manifest.sort((a, b) => {
  if (a.family !== b.family) return a.family.localeCompare(b.family)
  return a.variant.localeCompare(b.variant)
})

writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + '\n')

console.log(`\nWrote ${OUTPUT}`)
console.log(`Total: ${totalPlayable}/${totalVariants} playable`)
