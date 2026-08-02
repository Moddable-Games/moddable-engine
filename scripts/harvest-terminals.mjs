#!/usr/bin/env node
import '../packages/plugins/chess/index.js'
import { MCE } from '../packages/plugins/chess/src/mce-adapter.js'
import { variantLegalMoves, getVariantStatus } from '../packages/plugins/chess/src/mce/variants-util.js'
import { makeMove, getStatus } from '../packages/plugins/chess/src/mce/play.js'
import { createGame } from '../packages/play/src/sdk.js'
import { listVariants } from '../packages/play/src/variant-registry.js'

const GAMES_PER_VARIANT = parseInt(process.argv[3]) || 20
const MAX_PLIES = 200
const targetVariant = process.argv[2] || null

function seededRng(seed) {
  let s = seed
  return function () {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    return (s >>> 0) / 0xFFFFFFFF
  }
}

function mceMovesToKey(m) {
  return `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`
}

function pluginMoveToKey(m) {
  return `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`
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

const MCE_TYPE_MAP = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }

function mceBoardToArray(g) {
  const board = new Array(g.rows * g.cols).fill(null)
  for (let i = 0; i < g.board.length; i++) {
    const p = g.board[i]
    if (!p) continue
    const shortType = MCE.pieceType(p)
    board[i] = { type: MCE_TYPE_MAP[shortType] || shortType, owner: MCE.pieceColor(p) === MCE.WHITE ? 0 : 1 }
  }
  return board
}

function boardsEqual(pluginBoard, mceGame) {
  const mceBoard = mceBoardToArray(mceGame)
  if (pluginBoard.length !== mceBoard.length) return false
  for (let i = 0; i < pluginBoard.length; i++) {
    const a = pluginBoard[i], b = mceBoard[i]
    if (!a && !b) continue
    if (!a || !b) return false
    if (a.type !== b.type || a.owner !== b.owner) return false
  }
  return true
}

function normaliseOutcome(outcome, variant) {
  if (!outcome) return null
  const s = String(outcome)
  if (s === 'active' || s === 'check') return null
  if (s === 'checkmate' || s.endsWith('-w') || s === 'white') return 'white-wins'
  if (s.endsWith('-b') || s === 'black') return 'black-wins'
  if (s === 'stalemate') {
    const vc = MCE.variantRegistry[variant]
    if (vc && vc.stalemateMeaning === 'win') return 'stalemated-wins'
    if (vc && vc.stalemateMeaning === 'loss') return 'stalemated-loses'
    return 'draw'
  }
  if (s === 'draw' || s.startsWith('draw')) return 'draw'
  return s
}

const variants = (targetVariant ? [targetVariant] : listVariants('chess').map(v => v.key))
  .filter(k => MCE.variantRegistry[k])

const results = { fixtures: [], moveDivergences: [], applicationDivergences: [], outcomeDivergences: [] }

for (const variantKey of variants) {
  for (let gameNum = 0; gameNum < GAMES_PER_VARIANT; gameNum++) {
    const rng = seededRng(variantKey.length * 10000 + gameNum * 137)
    const mce = MCE.createGame(variantKey)
    let pluginGame
    try { pluginGame = createGame('chess', variantKey) } catch { continue }

    let diverged = false
    for (let ply = 0; ply < MAX_PLIES; ply++) {
      const mceMoves = variantLegalMoves(mce)
      const pluginMoves = pluginGame.getLegalMoves()

      if (mceMoves.length === 0 && pluginMoves.length === 0) break
      if (mceMoves.length === 0 || pluginMoves.length === 0) {
        results.moveDivergences.push({
          variant: variantKey, seed: gameNum, ply,
          mceCount: mceMoves.length, pluginCount: pluginMoves.length,
          position: boardToFen(pluginGame.getState().slice.board, mce.cols || 8),
        })
        diverged = true
        break
      }

      const mceSet = new Map(mceMoves.map(m => [mceMovesToKey(m), m]))
      const pluginSet = new Map(pluginMoves.map(m => [pluginMoveToKey(m), m]))
      const intersection = [...mceSet.keys()].filter(k => pluginSet.has(k))

      if (intersection.length === 0) {
        results.moveDivergences.push({
          variant: variantKey, seed: gameNum, ply,
          note: 'empty intersection',
          mceOnly: [...mceSet.keys()].slice(0, 5),
          pluginOnly: [...pluginSet.keys()].slice(0, 5),
          position: boardToFen(pluginGame.getState().slice.board, mce.cols || 8),
        })
        diverged = true
        break
      }

      const chosenKey = intersection[Math.floor(rng() * intersection.length)]
      const mceMove = mceSet.get(chosenKey)
      const pluginMove = pluginSet.get(chosenKey)

      const beforeFen = boardToFen(pluginGame.getState().slice.board, mce.cols || 8)
      makeMove(mce, mceMove)
      pluginGame.applyMove(pluginMove)

      if (!boardsEqual(pluginGame.getState().slice.board, mce)) {
        results.applicationDivergences.push({
          variant: variantKey, seed: gameNum, ply,
          move: chosenKey, positionBefore: beforeFen,
          mceAfter: boardToFen(mceBoardToArray(mce), mce.cols || 8),
          pluginAfter: boardToFen(pluginGame.getState().slice.board, mce.cols || 8),
        })
        diverged = true
        break
      }

      const mceVariantStatus = getVariantStatus(mce)
      const mceStatus = mceVariantStatus || getStatus(mce)
      const pluginStatus = pluginGame.checkWin()
      const mceTerminal = mceStatus && mceStatus !== 'active' && mceStatus !== 'check'
      const pluginTerminal = pluginStatus !== null && pluginStatus !== undefined

      if (mceTerminal || pluginTerminal) {
        const mceNorm = normaliseOutcome(mceStatus, variantKey)
        const pluginNorm = normaliseOutcome(pluginStatus, variantKey)
        if (mceNorm === pluginNorm) {
          results.fixtures.push({ variant: variantKey, seed: gameNum, ply, outcome: mceNorm, position: boardToFen(pluginGame.getState().slice.board, mce.cols || 8) })
        } else {
          results.outcomeDivergences.push({ variant: variantKey, seed: gameNum, ply, mce: mceStatus, plugin: pluginStatus, position: boardToFen(pluginGame.getState().slice.board, mce.cols || 8) })
        }
        diverged = true
        break
      }
    }
  }
}

console.log(`\nVariants: ${variants.length}, Games: ${variants.length * GAMES_PER_VARIANT}`)
console.log(`Fixtures (agree): ${results.fixtures.length}`)
console.log(`Move divergences: ${results.moveDivergences.length}`)
console.log(`Application divergences: ${results.applicationDivergences.length}`)
console.log(`Outcome divergences: ${results.outcomeDivergences.length}`)

if (results.moveDivergences.length > 0) {
  console.log('\nMove divergences (sample):')
  const seen = new Set()
  for (const d of results.moveDivergences) {
    if (seen.has(d.variant)) continue; seen.add(d.variant)
    console.log(`  ${d.variant} seed=${d.seed} ply=${d.ply}: ${d.note || `MCE=${d.mceCount} Plugin=${d.pluginCount}`}`)
  }
}

if (results.applicationDivergences.length > 0) {
  console.log('\nApplication divergences (sample):')
  const seen = new Set()
  for (const d of results.applicationDivergences) {
    if (seen.has(d.variant)) continue; seen.add(d.variant)
    console.log(`  ${d.variant} seed=${d.seed} ply=${d.ply} move=${d.move}`)
  }
}

if (results.outcomeDivergences.length > 0) {
  console.log('\nOutcome divergences:')
  for (const d of results.outcomeDivergences) {
    console.log(`  ${d.variant} seed=${d.seed} ply=${d.ply}: MCE=${d.mce} Plugin=${d.plugin}`)
  }
}
