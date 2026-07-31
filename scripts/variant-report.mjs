#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RULES_DIR = path.resolve(ROOT, '../moddable-rules/games')
const BOARD_INDEX = path.resolve(ROOT, 'boards/board-index.json')

const FAMILY_MAP = {
  chess: { rulesDir: 'chess', boardFamily: 'moddable-chess' },
  go: { rulesDir: 'go', boardFamily: 'go' },
  draughts: { rulesDir: 'draughts', boardFamily: 'draughts' },
  shogi: { rulesDir: 'shogi', boardFamily: 'shogi' },
  xiangqi: { rulesDir: 'xiangqi', boardFamily: 'xiangqi' },
  backgammon: { rulesDir: 'backgammon', boardFamily: 'backgammon' },
  mancala: { rulesDir: 'mancala', boardFamily: 'mancala' },
  morris: { rulesDir: 'morris', boardFamily: 'morris' },
  hex: { rulesDir: 'hex', boardFamily: 'hex' },
  reversi: { rulesDir: 'reversi', boardFamily: 'reversi' },
  halma: { rulesDir: 'halma', boardFamily: 'halma' },
  tafl: { rulesDir: 'tafl', boardFamily: 'tafl' },
}

function countRulesDocs(family) {
  const dir = path.join(RULES_DIR, FAMILY_MAP[family]?.rulesDir || family, 'content/variants')
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length
}

function countRendered(boardIndex, family) {
  const boardFamily = FAMILY_MAP[family]?.boardFamily || family
  return boardIndex.filter(b => b.family === boardFamily).length
}

async function getRegistered() {
  const { getRegisteredFamilies, listVariants } = await import('../packages/play/src/variant-registry.js')
  await import('../packages/plugins/chess/index.js')
  await import('../packages/plugins/go/index.js')
  await import('../packages/plugins/draughts/index.js')
  await import('../packages/plugins/xiangqi/index.js')
  await import('../packages/plugins/shogi/index.js')

  const result = {}
  for (const family of getRegisteredFamilies()) {
    result[family] = listVariants(family)
  }
  return result
}

async function testPlayability(registered) {
  const { createGame } = await import('../packages/play/src/sdk.js')
  const results = {}

  for (const [family, variants] of Object.entries(registered)) {
    results[family] = { playable: [], broken: [] }
    for (const v of variants) {
      try {
        const game = createGame(family, v.key)
        const moves = game.getLegalMoves()
        if (moves.length === 0) {
          results[family].broken.push({ key: v.key, reason: 'no legal moves at start' })
          continue
        }
        const result = game.applyMove(moves[0])
        if (!result || !result.ok) {
          results[family].broken.push({ key: v.key, reason: 'applyMove failed' })
          continue
        }
        const moves2 = game.getLegalMoves()
        if (moves2.length === 0) {
          results[family].broken.push({ key: v.key, reason: 'no legal moves after move 1' })
          continue
        }
        results[family].playable.push(v.key)
      } catch (e) {
        results[family].broken.push({ key: v.key, reason: e.message.slice(0, 80) })
      }
    }
  }
  return results
}

async function run() {
  const boardIndex = fs.existsSync(BOARD_INDEX)
    ? JSON.parse(fs.readFileSync(BOARD_INDEX, 'utf8'))
    : []

  const registered = await getRegistered()
  const playability = await testPlayability(registered)

  const families = [...new Set([
    ...Object.keys(FAMILY_MAP),
    ...Object.keys(registered),
  ])].sort()

  const rows = []
  for (const family of families) {
    const rulesDocs = countRulesDocs(family)
    const rendered = countRendered(boardIndex, family)
    const reg = registered[family] || []
    const play = playability[family] || { playable: [], broken: [] }
    rows.push({
      family,
      rulesDocs,
      rendered,
      registered: reg.length,
      playable: play.playable.length,
      broken: play.broken.length,
    })
  }

  const header = ['Family', 'Rules Docs', 'Rendered', 'Registered', 'Playable', 'Broken']
  const colWidths = header.map((h, i) => {
    const maxData = Math.max(...rows.map(r => String(Object.values(r)[i]).length))
    return Math.max(h.length, maxData)
  })

  const line = colWidths.map(w => '-'.repeat(w + 2)).join('+')
  const fmt = (vals) => vals.map((v, i) => ` ${String(v).padEnd(colWidths[i])} `).join('|')

  console.log(fmt(header))
  console.log(line)
  for (const r of rows) {
    console.log(fmt(Object.values(r)))
  }

  console.log('')
  const totalPlayable = rows.reduce((s, r) => s + r.playable, 0)
  const totalRegistered = rows.reduce((s, r) => s + r.registered, 0)
  const totalBroken = rows.reduce((s, r) => s + r.broken, 0)
  console.log(`Total: ${totalPlayable}/${totalRegistered} playable, ${totalBroken} broken`)

  const allBroken = Object.entries(playability)
    .flatMap(([family, p]) => p.broken.map(b => ({ family, ...b })))
  if (allBroken.length > 0) {
    console.log('\nBroken variants:')
    for (const b of allBroken) {
      console.log(`  ${b.family}/${b.key}: ${b.reason}`)
    }
  }
}

run().catch(e => { console.error(e); process.exit(1) })
