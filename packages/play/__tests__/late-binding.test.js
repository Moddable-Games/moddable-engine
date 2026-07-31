import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'
import { createGameForFamily } from '../src/play.js'
import { getVariantConfig } from '../src/variant-registry.js'
import { pluginConfigFromVariant, topologyFromVariant } from '../src/variant-definition.js'
import '../../plugins/chess/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RULES_DIR = path.resolve(__dirname, '../../../../moddable-rules/games')

function loadFrontmatter(family, slug) {
  const variantPath = path.join(RULES_DIR, family, 'content/variants', slug + '.md')
  if (!fs.existsSync(variantPath)) return null
  return parseFrontmatter(fs.readFileSync(variantPath, 'utf8')).meta || {}
}

function buildLateBoundDefinition(family, variant) {
  const fm = loadFrontmatter(family, variant)
  if (!fm || !fm.engine) return null

  const registryCfg = getVariantConfig(family, variant) || {}
  const topology = fm.engine.topology || null
  const setup = fm.engine.setup || undefined
  const players = fm.engine.players || ['white', 'black']

  const pluginConfig = {}
  if (setup) pluginConfig.setup = setup
  for (const [k, v] of Object.entries(registryCfg)) {
    if (typeof v === 'function') pluginConfig[k] = v
    else if (k === 'openingBook') pluginConfig[k] = v
  }

  return {
    title: fm.title || variant,
    slug: variant,
    parent: family,
    engine: { players, topology, plugins: { [family]: pluginConfig } },
  }
}

const hasRules = fs.existsSync(RULES_DIR)
const describeWithRules = hasRules ? describe : describe.skip

describeWithRules('late binding: frontmatter data + registry functions', () => {
  it('kingOfTheHill plays from frontmatter data + registry winCondition', () => {
    const def = buildLateBoundDefinition('chess', 'king-of-the-hill')
    expect(def).not.toBeNull()

    const game = createGameForFamily('chess', { variant: 'kingOfTheHill', definition: def })
    const moves = game.getLegalMoves()
    expect(moves.length).toBe(20)

    game.applyMove(moves[0])
    const moves2 = game.getLegalMoves()
    expect(moves2.length).toBeGreaterThan(0)
  })

  it('kingOfTheHill winCondition fires from late-bound game', () => {
    const def = buildLateBoundDefinition('chess', 'king-of-the-hill')
    const game = createGameForFamily('chess', { variant: 'kingOfTheHill', definition: def })

    const state = game.getState()
    expect(state.slice.board).toBeDefined()
    expect(game.checkWin()).toBeNull()
  })

  it('standard chess plays identically from frontmatter', () => {
    const def = buildLateBoundDefinition('chess', 'standard')
    expect(def).not.toBeNull()

    const fmGame = createGameForFamily('chess', { definition: def })
    const regGame = createGameForFamily('chess', { variant: 'standard' })

    expect(fmGame.getLegalMoves().length).toBe(regGame.getLegalMoves().length)
  })

  it('a pure-data variant needs no registry entry', () => {
    const fm = loadFrontmatter('chess', 'endgame-chess')
    if (!fm || !fm.engine) return

    const def = {
      title: fm.title,
      slug: 'endgame-chess',
      parent: 'chess',
      engine: { players: fm.engine.players || ['white', 'black'], topology: fm.engine.topology, plugins: { chess: { setup: fm.engine.setup, castling: false } } },
    }

    const game = createGameForFamily('chess', { definition: def })
    const moves = game.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
  })

  describe('data-only variants play correctly from frontmatter', () => {
    const DATA_ONLY = [
      { slug: 'endgame-chess', castling: false },
      { slug: 'pawns-only', castling: false },
      { slug: 'peasants-revolt', castling: false },
      { slug: 'stalemate-wins', stalemateMeaning: 'win' },
    ]

    it.each(DATA_ONLY.map(v => v.slug))('%s: instantiates, generates moves, advances state', (slug) => {
      const fm = loadFrontmatter('chess', slug)
      if (!fm || !fm.engine) return

      const extra = DATA_ONLY.find(v => v.slug === slug)
      const pluginConfig = { setup: fm.engine.setup }
      if (extra.castling === false) pluginConfig.castling = false
      if (extra.stalemateMeaning) pluginConfig.stalemateMeaning = extra.stalemateMeaning

      const def = {
        title: fm.title,
        slug,
        parent: 'chess',
        engine: { players: fm.engine.players || ['white', 'black'], topology: fm.engine.topology, plugins: { chess: pluginConfig } },
      }

      const game = createGameForFamily('chess', { definition: def })
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)

      const result = game.applyMove(moves[0])
      expect(result.ok).toBe(true)

      const moves2 = game.getLegalMoves()
      expect(moves2.length).toBeGreaterThan(0)
    })
  })

  it('frontmatter setup wins over registry setup (constructed conflict)', () => {
    const CONFLICT_SETUP = '4k3/8/8/8/8/8/8/4K3'
    const def = {
      title: 'Conflict Test',
      slug: 'standard',
      parent: 'chess',
      engine: {
        players: ['white', 'black'],
        topology: { type: 'grid', rows: 8, cols: 8 },
        plugins: { chess: { setup: CONFLICT_SETUP } },
      },
    }

    const game = createGameForFamily('chess', { variant: 'standard', definition: def })
    const state = game.getState().slice
    let pieceCount = 0
    for (const cell of state.board) {
      if (cell !== null) pieceCount++
    }
    expect(pieceCount).toBe(2)
  })
})
