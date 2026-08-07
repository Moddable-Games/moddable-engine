/**
 * Custom piece mobility test — verifies that pieces declared in engine.pieces
 * at the variant level actually generate legal moves through the SDK path.
 *
 * Catches the engine#89 class of bug: piece definitions reaching the plugin
 * but not producing moves because they were filtered, malformed, or using
 * an unrecognised format.
 *
 * For pieces behind pawn ranks that cannot move at game start, plays up to
 * 12 random plies to open the position before declaring them inert.
 */

import { createGameForFamily, setRulesReader, resolveFromDisk } from '../src/play.js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const RULES = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const STANDARD_CHESS = new Set(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'])

let rulesAvailable = true
try {
  readFileSync(join(RULES, 'chess', 'content', 'rulebook.md'), 'utf8')
} catch {
  rulesAvailable = false
}

if (rulesAvailable) {
  setRulesReader(
    (family, slug) => readFileSync(
      slug === 'rulebook'
        ? join(RULES, family, 'content', 'rulebook.md')
        : join(RULES, family, 'content', 'variants', `${slug}.md`),
      'utf8'
    ),
    (family) => {
      try {
        return readdirSync(join(RULES, family, 'content', 'variants'))
          .filter(f => f.endsWith('.md'))
          .map(f => f.replace(/\.md$/, ''))
      } catch { return [] }
    }
  )
}

const describeIfRules = rulesAvailable ? describe : describe.skip

describeIfRules('Custom piece mobility (engine#89)', () => {

  function getCustomCells(board) {
    const cells = new Set()
    for (let i = 0; i < board.length; i++) {
      if (board[i] && !STANDARD_CHESS.has(board[i].type)) cells.add(i)
    }
    return cells
  }

  function hasCustomMove(game) {
    const board = game.getState().slice.board
    const customCells = getCustomCells(board)
    if (customCells.size === 0) return true
    const moves = game.getLegalMoves()
    return moves.some(m => customCells.has(m.from))
  }

  function hasCustomMoveAfterDevelopment(game, maxPlies = 12) {
    if (hasCustomMove(game)) return true
    for (let ply = 0; ply < maxPlies; ply++) {
      const moves = game.getLegalMoves()
      if (moves.length === 0) return false
      game.applyMove(moves[ply % moves.length])
      if (hasCustomMove(game)) return true
    }
    return false
  }

  const variants = (() => {
    try {
      const files = readdirSync(join(RULES, 'chess', 'content', 'variants'))
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
      return files
    } catch { return [] }
  })()

  const variantsWithCustomPieces = variants.filter(slug => {
    try {
      const content = readFileSync(join(RULES, 'chess', 'content', 'variants', `${slug}.md`), 'utf8')
      if (!content.match(/^playable:\s*true/m)) return false
      const resolved = resolveFromDisk('chess', slug)
      if (!resolved) return false
      const game = createGameForFamily('chess', { variant: slug, definition: buildDef(resolved, slug) })
      const board = game.getState().slice.board
      return getCustomCells(board).size > 0
    } catch { return false }
  })

  function buildDef(resolved, slug) {
    const topo = resolved.topology || {}
    const players = resolved.players || ['white', 'black']
    const pluginConfig = {}
    if (resolved.plugins?.chess) Object.assign(pluginConfig, resolved.plugins.chess)
    const STRUCTURAL = new Set(['topology', 'players', 'meta', 'surface', 'render', 'components', 'plugins', 'pieces'])
    for (const [k, v] of Object.entries(resolved)) {
      if (STRUCTURAL.has(k)) continue
      if (v !== undefined) pluginConfig[k] = v
    }
    if (resolved.pieces && (resolved.pieces.set || resolved.pieces.vocabulary)) {
      const { set, vocabulary, ...movementDefs } = resolved.pieces
      if (Object.keys(movementDefs).length > 0) {
        pluginConfig.pieces = { ...pluginConfig.pieces, ...movementDefs }
      }
    }
    const def = { title: slug, slug, parent: 'chess', engine: { players, plugins: { chess: pluginConfig } } }
    if (topo.type) def.engine.topology = { ...topo }
    return def
  }

  test(`all ${variantsWithCustomPieces.length} chess variants with custom pieces on the board produce custom-piece moves`, () => {
    const inert = []
    for (const slug of variantsWithCustomPieces) {
      const resolved = resolveFromDisk('chess', slug)
      if (!resolved) continue
      try {
        const game = createGameForFamily('chess', { variant: slug, definition: buildDef(resolved, slug) })
        if (!hasCustomMoveAfterDevelopment(game)) {
          inert.push(slug)
        }
      } catch (e) {
        inert.push(`${slug} (${e.message.slice(0, 40)})`)
      }
    }
    expect(inert).toEqual([])
  })
})
