#!/usr/bin/env node
/**
 * Playability matrix: AI-vs-AI to terminal state for all registered chess variants.
 * Outputs a table showing which variants reach a game-ending condition.
 */

import '../packages/plugins/chess/index.js'
import { createGame } from '../packages/play/src/sdk.js'
import { listVariants, getVariantConfig } from '../packages/play/src/variant-registry.js'

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
    const game = createGame('chess', key)

    if (cfg.placementPieces) {
      const toPlace = game.getState().slice._toPlace
      if (toPlace) {
        let placementMoves = 0
        while (game.getState().slice._phase === 'placement' && placementMoves < 50) {
          const moves = game.getLegalMoves()
          if (moves.length === 0) break
          game.applyMove(moves[Math.floor(Math.random() * moves.length)])
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
      const move = moves[Math.floor(Math.random() * moves.length)]
      const result = game.applyMove(move)
      plies++
      if (result && result.winner) {
        outcome = `winner:${result.winner}`
        break
      }
      if (result && result.continueTurn) {
        let subPlies = 0
        while (result.continueTurn && subPlies < 20) {
          const subMoves = game.getLegalMoves()
          if (subMoves.length === 0) break
          const sub = game.applyMove(subMoves[Math.floor(Math.random() * subMoves.length)])
          subPlies++
          if (sub && sub.winner) { outcome = `winner:${sub.winner}`; break }
          if (!sub || !sub.continueTurn) break
        }
        if (outcome) break
      }
    }

    if (!outcome) outcome = `incomplete@${MAX_PLIES}`
    results.push({ key, status: outcome.startsWith('winner') || outcome === 'no-moves' ? 'terminal' : 'timeout', plies, outcome })
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
