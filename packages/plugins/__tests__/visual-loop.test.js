import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'
import { buildPieceImages } from '../../render/src/render-engine.js'
import { boardToSetup } from '../../play/src/serialise.js'
import { listVariants, getRegisteredFamilies } from '../../play/src/variant-registry.js'
import { createGame } from '../../play/src/sdk.js'
import { createGameForFamily } from '../../play/src/play.js'
import { interactionModelFor } from '../../play/src/interaction.js'
import { resolveFromDisk } from '../../play/src/play.js'

import '../../play/test-helpers/setup-rules-reader.js'
import '../chess/index.js'
import '../go/index.js'
import '../draughts/index.js'
import '../xiangqi/index.js'
import '../shogi/index.js'
import '../reversi/index.js'

// The Go and draughts batch shipped with pieces that were invisible during play
// while the game logic ran correctly underneath. Every unit test passed, because
// none of them followed a piece all the way to artwork. These tests walk the
// whole loop: game state, serialised through the plugin's declared vocabulary,
// resolved against the piece set the rules name, and asserted to land on a real
// image. They check it after moves as well as at the opening, because the
// opening renders from the cascade's own setup and so proves nothing.
function resolveRulesDir() {
  const candidates = [
    process.env.MODDABLE_RULES_DIR,
    path.resolve(process.cwd(), '../moddable-rules/games'),
    '/Applications/MAMP/htdocs/MODDABLE/moddable-rules/games',
    '/tmp/rules/games',
  ].filter(Boolean)
  return candidates.find(dir => fs.existsSync(dir)) || null
}

const RULES_DIR = resolveRulesDir()
const GALLERY_PATH = path.resolve(process.cwd(), 'pieces/gallery-index.json')
const gallery = fs.existsSync(GALLERY_PATH)
  ? JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'))
  : null

const describeWithAssets = RULES_DIR && gallery ? describe : describe.skip

function hubPieces(family) {
  const hubFile = path.join(RULES_DIR, family, 'content/rulebook.md')
  if (!fs.existsSync(hubFile)) return null
  const meta = parseFrontmatter(fs.readFileSync(hubFile, 'utf8')).meta || {}
  return meta.engine?.pieces || null
}

// Mirrors how the render pipeline turns a setup string into piece identifiers:
// through the vocabulary the rules declare, falling back to the raw symbol.
// Handles slash-delimited FEN, comma-separated FEN4, and colon-delimited coords.
function setupToImageKeys(setup, vocabulary) {
  if (!setup) return []
  const ranks = setup.split(' ')[0].split('/')
  const isCommaSeparated = ranks.some(r => r.includes(','))
  const isCoordFormat = ranks.some(r => r.includes(':'))
  const keys = []

  if (isCoordFormat) {
    for (const pair of setup.split(',')) {
      const [, piece] = pair.split(':')
      if (piece) keys.push(vocabulary && vocabulary[piece] ? vocabulary[piece] : piece)
    }
    return keys
  }

  for (const rank of ranks) {
    if (isCommaSeparated) {
      for (const token of rank.split(',')) {
        const trimmed = token.trim()
        if (!trimmed || /^\d+$/.test(trimmed)) continue
        keys.push(trimmed)
      }
    } else {
      for (let i = 0; i < rank.length; i++) {
        const ch = rank[i]
        if (ch >= '0' && ch <= '9') {
          if (rank[i + 1] >= '0' && rank[i + 1] <= '9') i++
          continue
        }
        if (ch === '+') {
          keys.push('+' + rank[i + 1])
          i++
          continue
        }
        keys.push(vocabulary && vocabulary[ch] ? vocabulary[ch] : ch)
      }
    }
  }
  return keys
}

function playedPosition(family, key, moveCount) {
  const game = createGame(family, key)
  const plugin = game.raw.registry.getPlugins().find(p => p.sliceName === family)
  let played = 0
  for (let i = 0; i < moveCount; i++) {
    const moves = game.getLegalMoves().filter(m => m.action !== 'pass' && m.action !== 'resign')
    if (moves.length === 0) break
    const result = game.applyMove(moves[Math.floor(moves.length / 2)])
    if (!result || !result.ok) break
    played++
  }
  const slice = game.getState().slice
  const cols = slice.cols || slice._cols || Math.round(Math.sqrt(slice.board.length))
  const rows = Math.round(slice.board.length / cols)
  return {
    game,
    plugin,
    played,
    slice,
    setup: boardToSetup(slice, { rows, cols }, plugin.vocabulary),
  }
}

const NONDETERMINISTIC = new Set(['chess960', 'sittuyin'])

function everyVariant() {
  const out = []
  for (const family of getRegisteredFamilies()) {
    for (const variant of listVariants(family)) {
      if (NONDETERMINISTIC.has(variant.key)) continue
      out.push([family, variant.key])
    }
  }
  return out
}

describeWithAssets('every piece resolves to real artwork during play', () => {
  it.each(everyVariant())('%s/%s renders every piece after moves', (family, key) => {
    const hub = hubPieces(family)
    if (!hub || !hub.set) return

    const resolved = resolveFromDisk(family, key)
    const variantVocab = resolved?.vocabulary || resolved?.plugins?.[family]?.vocabulary || null
    const vocab = { ...(hub.vocabulary || {}), ...(variantVocab || {}) }
    const hasVocab = Object.keys(vocab).length > 0 ? vocab : null

    const { images } = buildPieceImages(hub.set, gallery, hasVocab, false)
    const { setup, played } = playedPosition(family, key, 4)

    const keys = setupToImageKeys(setup, hasVocab)
    const unresolved = [...new Set(keys.filter(k => !images[k]))]

    expect(unresolved).toEqual([])
    expect(keys.length + played).toBeGreaterThan(0)
  })

  it.each(everyVariant())('%s/%s changes state when a move is played', (family, key) => {
    const before = createGame(family, key)
    const opening = JSON.stringify(before.getState().slice.board)

    const { slice, played } = playedPosition(family, key, 2)
    expect(played).toBeGreaterThan(0)
    expect(JSON.stringify(slice.board)).not.toBe(opening)
  })
})

describeWithAssets('click round-trip reaches a legal move', () => {
  it.each(everyVariant())('%s/%s resolves a click to a move the rules allow', (family, key) => {
    const game = createGame(family, key)
    const model = interactionModelFor(family)
    const allMoves = game.getLegalMoves()
    const moves = allMoves.filter(m => m.action === undefined)
    const actionMoves = allMoves.filter(m => m.action !== undefined)
    expect(moves.length + actionMoves.length).toBeGreaterThan(0)

    const target = moves[0] || actionMoves[0]
    const playerIndex = 0
    const ownerAt = (pos) => {
      const cell = game.getState().slice.board[pos]
      if (!cell) return null
      if (typeof cell === 'number') return cell
      if (typeof cell === 'string') return cell === 'black' ? 0 : 1
      return cell.owner
    }

    if (model.name === 'place') {
      const placeMoves = allMoves.filter(m => m.coord !== undefined)
      const placeTarget = placeMoves[0]
      if (!placeTarget) return
      const result = model.handleClick(placeTarget.coord, { moves: placeMoves })
      expect(result.type).toBe('move')
      expect(game.applyMove(result.move).ok).toBe(true)
      return
    }

    // move, chain and drop models all select first, then commit.
    const select = model.handleClick(target.from, {
      selected: null, chainAnchor: null, dropType: null,
      moves, playerIndex, getOwnerAt: ownerAt,
    })
    expect(select.type).toBe('select')

    const commit = model.handleClick(target.to, {
      selected: target.from, chainAnchor: null, dropType: null,
      moves, playerIndex, getOwnerAt: ownerAt,
    })
    expect(['move', 'choice']).toContain(commit.type)
    const move = commit.type === 'move' ? commit.move : commit.candidates[0]
    expect(game.applyMove(move).ok).toBe(true)
  })
})

const DATA_ONLY_VARIANTS = [
  { slug: 'endgame-chess', config: { castling: false } },
  { slug: 'pawns-only', config: { castling: false } },
  { slug: 'peasants-revolt', config: { castling: false } },
  { slug: 'chigorin', config: { castling: false } },
]

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_ONLY_RULES = process.env.MODDABLE_RULES_DIR || path.resolve(__dirname, '../../../../moddable-rules/games')

function loadDataOnlyVariant(slug, extraConfig) {
  const varPath = path.join(DATA_ONLY_RULES, 'chess/content/variants', slug + '.md')
  if (!fs.existsSync(varPath)) return null
  const fm = parseFrontmatter(fs.readFileSync(varPath, 'utf8')).meta || {}
  if (!fm.engine) return null
  const pluginConfig = { setup: fm.engine.setup, ...extraConfig }
  if (fm.engine.vocabulary) pluginConfig.vocabulary = fm.engine.vocabulary
  if (fm.engine.plugins?.chess?.pieces) pluginConfig.pieces = fm.engine.plugins.chess.pieces
  const engineDef = { players: fm.engine.players || ['white', 'black'], topology: fm.engine.topology, plugins: { chess: pluginConfig } }
  return createGameForFamily('chess', {
    definition: { title: fm.title, slug, parent: 'chess', engine: engineDef },
  })
}

describeWithAssets('data-only chess variants: artwork + state change', () => {
  it.each(DATA_ONLY_VARIANTS.map(v => v.slug))('%s: every piece resolves to artwork after moves', (slug) => {
    const pieces = hubPieces('chess')
    if (!pieces || !pieces.set) return

    const extra = DATA_ONLY_VARIANTS.find(v => v.slug === slug)
    const game = loadDataOnlyVariant(slug, extra.config)
    if (!game) return

    const { images } = buildPieceImages(pieces.set, gallery, pieces.vocabulary || null, false)
    const plugin = game.raw.registry.getPlugins().find(p => p.sliceName === 'chess')

    let played = 0
    for (let i = 0; i < 4; i++) {
      const moves = game.getLegalMoves().filter(m => m.action !== 'pass' && m.action !== 'resign')
      if (moves.length === 0) break
      const result = game.applyMove(moves[Math.floor(moves.length / 2)])
      if (!result || !result.ok) break
      played++
    }

    const slice = game.getState().slice
    const cols = slice._cols || 8
    const rows = Math.round(slice.board.length / cols)
    const setup = boardToSetup(slice, { rows, cols }, plugin.vocabulary)
    const keys = setupToImageKeys(setup, pieces.vocabulary || null)
    const unresolved = [...new Set(keys.filter(k => !images[k]))]

    expect(unresolved).toEqual([])
    expect(keys.length + played).toBeGreaterThan(0)
  })

  it.each(DATA_ONLY_VARIANTS.map(v => v.slug))('%s: state changes after moves', (slug) => {
    const extra = DATA_ONLY_VARIANTS.find(v => v.slug === slug)
    const game = loadDataOnlyVariant(slug, extra.config)
    if (!game) return

    const opening = JSON.stringify(game.getState().slice.board)
    const moves = game.getLegalMoves()
    if (moves.length === 0) return
    game.applyMove(moves[0])
    const after = JSON.stringify(game.getState().slice.board)
    expect(after).not.toBe(opening)
  })
})
