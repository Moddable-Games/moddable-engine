import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'
import { createGameForFamily } from '../src/play.js'
import { MCE } from '../../plugins/chess/src/mce-adapter.js'
import { variantLegalMoves } from '../../plugins/chess/src/mce/variants-util.js'
import { makeMove } from '../../plugins/chess/src/mce/play.js'
import '../../plugins/chess/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RULES_DIR = path.resolve(__dirname, '../../../../moddable-rules/games')

const VERIFIED_DATA_ONLY = [
  { slug: 'endgame-chess', mceKey: 'endgameChess', config: { castling: false } },
  { slug: 'pawns-only', mceKey: 'pawnsOnly', config: { castling: false } },
  { slug: 'peasants-revolt', mceKey: 'peasantsRevolt', config: { castling: false } },
  { slug: 'chigorin', mceKey: 'chigorin', config: { castling: false } },
]

function loadFrontmatter(family, slug) {
  const p = path.join(RULES_DIR, family, 'content/variants', slug + '.md')
  if (!fs.existsSync(p)) return null
  return parseFrontmatter(fs.readFileSync(p, 'utf8')).meta || {}
}

function createFromFrontmatter(slug, extra) {
  const fm = loadFrontmatter('chess', slug)
  if (!fm || !fm.engine) return null
  const pluginConfig = { setup: fm.engine.setup, ...extra }
  return createGameForFamily('chess', {
    definition: {
      title: fm.title,
      slug,
      parent: 'chess',
      engine: { players: fm.engine.players || ['white', 'black'], topology: fm.engine.topology, plugins: { chess: pluginConfig } },
    },
  })
}

function mceMovesToSet(moves) {
  return new Set(moves.map(m => `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`))
}

function pluginMovesToSet(moves) {
  return new Set(moves.map(m => `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`))
}

// Derived from MCE's createVariantGame: keys that add or change behaviour.
// Restriction flags (noCastling, noEnPassant, noPromotion) are excluded:
// they disable existing mechanics and the generic plugin handles them as
// config data (castling: false, enPassant: false).
const BEHAVIOUR_KEYS = new Set([
  'moveFilter', 'winCondition', 'visibility', 'evaluate', 'init',
  'positionKey', 'onEffectExpiry', 'stalemateMeaning',
  'checkThreshold', 'noCheck', 'divergentPieces', 'pieceRoles',
  'pawnDirection', 'pawnMoveStyle', 'pawnStartRow',
  'maxMovesPerTurn', 'progressiveMove', 'royalPiece',
  'promotionPieces', 'promotionRank', 'torpedo',
  'wrapFiles', 'wrapRanks', 'aiMoveCount',
])

const hasRules = fs.existsSync(RULES_DIR)
const describeIf = hasRules ? describe : describe.skip

describeIf('VERIFIED_DATA_ONLY: 10-ply parity against MCE', () => {
  it.each(VERIFIED_DATA_ONLY.map(v => [v.slug, v.mceKey, v.config]))('%s: matches MCE over 10 plies', (slug, mceKey, config) => {
    const plugin = createFromFrontmatter(slug, config)
    expect(plugin).not.toBeNull()

    const mce = MCE.createGame(mceKey)

    for (let ply = 0; ply < 10; ply++) {
      const mceMvs = variantLegalMoves(mce)
      const pluginMvs = plugin.getLegalMoves()

      const mceSet = mceMovesToSet(mceMvs)
      const pluginSet = pluginMovesToSet(pluginMvs)
      const mceOnly = [...mceSet].filter(m => !pluginSet.has(m))
      const pluginOnly = [...pluginSet].filter(m => !mceSet.has(m))

      expect({ ply, mceOnly, pluginOnly }).toEqual({ ply, mceOnly: [], pluginOnly: [] })

      if (mceMvs.length === 0) break

      const mceMove = mceMvs[ply % mceMvs.length]
      makeMove(mce, mceMove)

      const pluginMove = pluginMvs.find(m => m.from === mceMove.from && m.to === mceMove.to && !m.promotion) ||
        pluginMvs.find(m => m.from === mceMove.from && m.to === mceMove.to)
      if (!pluginMove) break
      plugin.applyMove(pluginMove)
    }
  })
})

describeIf('VERIFIED_DATA_ONLY: structural check against MCE source', () => {
  it.each(VERIFIED_DATA_ONLY.map(v => [v.slug, v.mceKey]))('%s: MCE variant has no behaviour keys', (slug, mceKey) => {
    const vc = MCE.variantRegistry[mceKey]
    expect(vc).toBeDefined()
    const behaviourFound = Object.keys(vc).filter(k => BEHAVIOUR_KEYS.has(k))
    expect(behaviourFound).toEqual([])
  })
})
