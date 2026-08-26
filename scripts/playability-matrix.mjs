#!/usr/bin/env node
/**
 * Playability matrix: AI-vs-AI to terminal state for all registered chess variants.
 * Outputs a table showing which variants reach a game-ending condition.
 */

import '../packages/plugins/chess/index.js'
import { createGame } from '../packages/play/src/sdk.js'
import { listVariants, getVariantConfig } from '../packages/play/src/variant-registry.js'
import { probePicker } from './lib/probe-rng.mjs'

const MAX_PLIES = 400
const variants = listVariants('chess').map(v => v.key).sort()

const results = []

for (const key of variants) {
  const cfg = getVariantConfig('chess', key) || {}
  if (cfg.visibility) {
    results.push({ key, status: 'skip-fog', plies: 0, outcome: 'N/A (fog)' })
    continue
  }

  try {
    const pick = probePicker('chess', key)
    const game = createGame('chess', key)

    if (cfg.placementPieces) {
      const toPlace = game.getState().slice._toPlace
      if (toPlace) {
        let placementMoves = 0
        while (game.getState().slice._phase === 'placement' && placementMoves < 50) {
          const moves = game.getLegalMoves()
          if (moves.length === 0) break
          game.applyMove(pick(moves))
          placementMoves++
        }
        if (game.getState().slice._phase === 'placement') {
          results.push({ key, status: 'deadlock-placement', plies: placementMoves, outcome: 'Placement deadlocked' })
          continue
        }
      }
    }

    let plies = 0
    let outcome = null
    while (plies < MAX_PLIES) {
      const moves = game.getLegalMoves()
      if (moves.length === 0) {
        outcome = 'no-moves'
        break
      }
      const move = pick(moves)
      const result = game.applyMove(move)
      if (!result || !result.ok) {
        outcome = 'move-rejected'
        break
      }
      plies++
      if (result.winner) {
        outcome = `winner:${result.winner}`
        break
      }
      if (result.continueTurn) {
        let subPlies = 0
        while (subPlies < 50) {
          const subMoves = game.getLegalMoves()
          if (subMoves.length === 0) { outcome = 'deadlock-continuation'; break }
          const sub = game.applyMove(pick(subMoves))
          subPlies++
          if (!sub || !sub.ok) { outcome = 'move-rejected'; break }
          if (sub.winner) { outcome = `winner:${sub.winner}`; break }
          if (!sub.continueTurn) break
        }
        if (outcome) break
        if (subPlies >= 50) { outcome = 'deadlock-continuation'; break }
      }
    }

    if (!outcome) outcome = `timeout@${MAX_PLIES}`

    let status
    if (outcome.startsWith('winner')) status = 'terminal'
    else if (outcome === 'no-moves') status = 'terminal'
    else if (outcome === 'move-rejected') status = 'deadlock'
    else if (outcome === 'deadlock-continuation') status = 'deadlock'
    else status = 'timeout'

    results.push({ key, status, plies, outcome })
  } catch (e) {
    results.push({ key, status: 'error', plies: 0, outcome: e.message.slice(0, 60) })
  }
}

const terminal = results.filter(r => r.status === 'terminal')
const timeout = results.filter(r => r.status === 'timeout')
const errors = results.filter(r => r.status === 'error')
const skipped = results.filter(r => r.status.startsWith('skip'))
const deadlocked = results.filter(r => r.status === 'deadlock-placement')

console.log(`\n=== Playability Matrix (AI-vs-AI, ${MAX_PLIES} ply limit) ===\n`)
console.log(`Terminal: ${terminal.length}  |  Timeout: ${timeout.length}  |  Error: ${errors.length}  |  Deadlock: ${deadlocked.length}  |  Skipped: ${skipped.length}`)
console.log(`Total: ${results.length}\n`)

if (errors.length) {
  console.log('--- ERRORS ---')
  for (const r of errors) console.log(`  ${r.key}: ${r.outcome}`)
  console.log()
}
if (deadlocked.length) {
  console.log('--- DEADLOCKED ---')
  for (const r of deadlocked) console.log(`  ${r.key}: ${r.outcome} (${r.plies} plies)`)
  console.log()
}
if (timeout.length) {
  console.log('--- TIMEOUT (no terminal in ' + MAX_PLIES + ' plies) ---')
  for (const r of timeout) console.log(`  ${r.key}: ${r.plies} plies`)
  console.log()
}

console.log('--- TERMINAL ---')
for (const r of terminal) console.log(`  ${r.key}: ${r.outcome} @ ${r.plies} plies`)
