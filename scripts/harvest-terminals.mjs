#!/usr/bin/env node
import '../packages/plugins/chess/index.js'
import { MCE } from '../packages/plugins/chess/src/mce-adapter.js'
import { variantLegalMoves } from '../packages/plugins/chess/src/mce/variants-util.js'
import { makeMove, getStatus } from '../packages/plugins/chess/src/mce/play.js'
import { createGame } from '../packages/play/src/sdk.js'
import { listVariants } from '../packages/play/src/variant-registry.js'

const GAMES_PER_VARIANT = parseInt(process.argv[3]) || 20
const MAX_PLIES = 200
const targetVariant = process.argv[2] || null

const OUTCOME_KEYS = new Set(['winCondition', 'stalemateMeaning', 'checkThreshold', 'noCheck'])
const variants = listVariants('chess')
  .filter(v => {
    if (targetVariant) return v.key === targetVariant
    const config = Object.keys(v)
    return true
  })
  .map(v => v.key)

const results = { fixtures: [], divergences: [] }

for (const variantKey of variants) {
  if (!MCE.variantRegistry[variantKey]) continue

  for (let gameNum = 0; gameNum < GAMES_PER_VARIANT; gameNum++) {
    const mce = MCE.createGame(variantKey)
    let pluginGame
    try { pluginGame = createGame('chess', variantKey) } catch { continue }

    for (let ply = 0; ply < MAX_PLIES; ply++) {
      const mceMoves = variantLegalMoves(mce)
      if (mceMoves.length === 0) break

      const pluginMoves = pluginGame.getLegalMoves()
      if (pluginMoves.length === 0) break

      const mceMove = mceMoves[Math.floor(Math.random() * mceMoves.length)]
      makeMove(mce, mceMove)

      const pluginMove = pluginMoves.find(m => m.from === mceMove.from && m.to === mceMove.to && !m.promotion) ||
        pluginMoves.find(m => m.from === mceMove.from && m.to === mceMove.to)
      if (!pluginMove) break
      pluginGame.applyMove(pluginMove)

      const mceStatus = getStatus(mce)
      const pluginStatus = pluginGame.checkWin()

      const mceTerminal = mceStatus && mceStatus !== 'active' && mceStatus !== 'check'
      const pluginTerminal = pluginStatus !== null && pluginStatus !== undefined

      if (mceTerminal || pluginTerminal) {
        const mceOutcome = mceTerminal ? mceStatus : null
        const pluginOutcome = pluginTerminal ? pluginStatus : null

        const boardFen = boardToFen(pluginGame.getState().slice.board, mce.cols || 8)

        if (mceTerminal && pluginTerminal && normaliseOutcome(mceOutcome) === normaliseOutcome(pluginOutcome)) {
          results.fixtures.push({
            variant: variantKey,
            position: boardFen,
            mceOutcome: mceOutcome,
            pluginOutcome: pluginOutcome,
            ply,
          })
        } else {
          results.divergences.push({
            kind: 'outcome',
            variant: variantKey,
            position: boardFen,
            sideToMove: ply % 2 === 0 ? 'black' : 'white',
            implA: { name: 'mce', outcome: mceOutcome },
            implB: { name: 'chess-plugin', outcome: pluginOutcome },
            ply,
          })
        }
        break
      }
    }
  }
}

console.log(`\nResults: ${results.fixtures.length} agreements, ${results.divergences.length} divergences`)
console.log(`Variants tested: ${variants.length}`)

if (results.divergences.length > 0) {
  console.log('\nDivergences:')
  for (const d of results.divergences) {
    console.log(`  ${d.variant} ply ${d.ply}: MCE=${d.implA.outcome} Plugin=${d.implB.outcome}`)
    console.log(`    FEN: ${d.position}`)
  }
}

if (results.fixtures.length > 0) {
  console.log(`\nAgreements (sample):`)
  const seen = new Set()
  for (const f of results.fixtures) {
    if (seen.has(f.variant)) continue
    seen.add(f.variant)
    console.log(`  ${f.variant} ply ${f.ply}: ${f.mceOutcome}`)
  }
}

function boardToFen(board, cols) {
  const rows = board.length / cols
  const fenRows = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const cell = board[r * cols + c]
      if (!cell) { empty++; continue }
      if (empty > 0) { row += empty; empty = 0 }
      const SYMS = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }
      const sym = SYMS[cell.type] || '?'
      row += cell.owner === 0 ? sym.toUpperCase() : sym
    }
    if (empty > 0) row += empty
    fenRows.push(row)
  }
  return fenRows.join('/')
}

function normaliseOutcome(outcome) {
  if (!outcome) return null
  if (outcome === 'checkmate' || outcome.includes('-w') || outcome === 'white') return 'white-wins'
  if (outcome.includes('-b') || outcome === 'black') return 'black-wins'
  if (outcome === 'draw' || outcome.startsWith('draw') || outcome === 'stalemate') return 'draw'
  if (outcome.startsWith('race-w') || outcome.startsWith('breakthrough-w') || outcome.startsWith('antichess-w') || outcome.startsWith('codrus-w') || outcome.startsWith('shatar-w') || outcome.startsWith('extinction-w')) return 'white-wins'
  if (outcome.startsWith('race-b') || outcome.startsWith('breakthrough-b') || outcome.startsWith('antichess-b') || outcome.startsWith('codrus-b') || outcome.startsWith('shatar-b') || outcome.startsWith('extinction-b')) return 'black-wins'
  return outcome
}
