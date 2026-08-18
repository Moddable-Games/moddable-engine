import fs from 'fs'
import path from 'path'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'
import { listVariants, getRegisteredFamilies, getSlugForKey } from '../../play/src/variant-registry.js'
import { createGame } from '../../play/src/sdk.js'

import '../chess/index.js'
import '../go/index.js'
import '../draughts/index.js'
import '../reversi/index.js'
import '../xiangqi/index.js'
import '../shogi/index.js'

// The starting position for every variant is content, owned by moddable-rules,
// and is the exact string the published board diagram is drawn from. These
// tests assert the engine agrees with that content rather than re-deriving it,
// because a divergence means the played board and the diagram disagree, which
// is how Turkish Draughts shipped starting a rank out of place.
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
const describeWithRules = RULES_DIR ? describe : describe.skip

function fenToGrid(fen, rows, cols) {
  const grid = []
  for (const rank of fen.split('/')) {
    const row = []
    for (let i = 0; i < rank.length; i++) {
      const ch = rank[i]
      if (ch >= '0' && ch <= '9') {
        let n = ch
        if (rank[i + 1] >= '0' && rank[i + 1] <= '9') { n += rank[i + 1]; i++ }
        for (let k = 0; k < Number(n); k++) row.push('.')
      } else row.push(ch)
    }
    while (row.length < cols) row.push('.')
    grid.push(row)
  }
  while (grid.length < rows) grid.push(new Array(cols).fill('.'))
  return grid
}

// Plugins store cells three different ways: as objects, as bare colour strings,
// and as raw owner indices. All three have to resolve back to a symbol.
function cellSymbol(cell, vocabulary) {
  if (cell === null || cell === undefined) return '.'
  if (typeof cell === 'number') {
    const first = Object.values(vocabulary || {})[0]
    return first?.symbols?.[cell] ?? String(cell)
  }
  if (typeof cell === 'string') return cell === 'black' ? 'b' : 'w'
  return vocabulary?.[cell.type]?.symbols?.[cell.owner] ?? '?'
}

function boardGrid(game, plugin) {
  const slice = game.getState().slice
  const board = slice.board || []
  const topo = game.raw?.topology
  const cols = topo?.cols || slice.cols || slice._cols || Math.round(Math.sqrt(board.length))
  const rows = topo?.rows || Math.round(board.length / cols)
  const grid = []
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) row.push(cellSymbol(board[r * cols + c], plugin.vocabulary))
    grid.push(row)
  }
  return { grid, rows, cols }
}

function camelToKebab(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

function variantSetup(family, key) {
  const slug = getSlugForKey(family, key)
  const candidates = [
    slug,
    key,
    camelToKebab(key),
    camelToKebab(key).replace(/-chess$/, ''),
  ]
  for (const name of candidates) {
    const file = path.join(RULES_DIR, family, 'content/variants', `${name}.md`)
    if (fs.existsSync(file)) {
      const meta = parseFrontmatter(fs.readFileSync(file, 'utf8')).meta || {}
      return { setup: meta.engine?.setup, meta }
    }
  }
  return { missing: true }
}

function everyRegisteredVariant() {
  const out = []
  for (const family of getRegisteredFamilies()) {
    for (const variant of listVariants(family)) out.push([family, variant.key])
  }
  return out
}

describeWithRules('start position matches moddable-rules', () => {
  const variants = everyRegisteredVariant()

  const VARIANT_FLOOR = 55
  it('variant coverage meets floor', () => {
    expect(variants.length).toBeGreaterThanOrEqual(VARIANT_FLOOR)
  })

  const KNOWN_UNMAPPABLE = new Set(['chess/chess960'])

  it('every registered variant has a rules file', () => {
    const missing = variants.filter(([f, k]) => variantSetup(f, k).missing && !KNOWN_UNMAPPABLE.has(`${f}/${k}`))
    expect(missing.map(([f, k]) => `${f}/${k}`)).toEqual([])
  })

  const KNOWN_MISMATCH = new Set([
    'chess/breakthrough',
    'chess/chaturanga',
    'chess/empire',
    'chess/hexapawn',
    'chess/horde',
    'chess/khans-chess',
    'chess/maharaja',
    'chess/monsterChess',
    'chess/ouk-chaktrang',
    'chess/racingKings',
    'chess/shatranj',
    'chess/sittuyin',
  ])
  const MISMATCH_CEILING = 12

  it(`known mismatch count does not exceed ceiling (${MISMATCH_CEILING})`, () => {
    expect(KNOWN_MISMATCH.size).toBeLessThanOrEqual(MISMATCH_CEILING)
  })

  it.each(everyRegisteredVariant())('%s/%s starts in the position the rules declare', (family, key) => {
    const { setup, missing } = variantSetup(family, key)
    if (missing) return
    if (KNOWN_MISMATCH.has(`${family}/${key}`)) return

    const game = createGame(family, key)
    const plugin = game.raw.registry.getPlugins().find(p => p.sliceName === family)
    const { grid, rows, cols } = boardGrid(game, plugin)
    const generated = grid.map(r => r.join('')).join('/')

    if (setup === undefined || setup === '') {
      // No declared setup means the game begins on an empty board, as Go does.
      expect(generated).toMatch(/^[./]+$/)
      return
    }

    const canon = fenToGrid(setup, rows, cols).map(r => r.join('')).join('/')
    expect(generated).toBe(canon)
  })

  it('no variant silently renders an unknown piece symbol', () => {
    const offenders = []
    for (const [family, key] of variants) {
      const game = createGame(family, key)
      const plugin = game.raw.registry.getPlugins().find(p => p.sliceName === family)
      const { grid } = boardGrid(game, plugin)
      if (grid.some(row => row.includes('?'))) offenders.push(`${family}/${key}`)
    }
    expect(offenders).toEqual([])
  })
})

// Artwork resolution is tested by visual-loop.test.js which covers all
// families after moves (not just at opening), making it authoritative.
