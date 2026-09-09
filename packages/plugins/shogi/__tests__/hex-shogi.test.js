import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createShogiPlugin } from '../index.js'
import { createHexTopology } from '../../../topologies/hex/index.js'
import { resolveVariantSync } from '../../../play/src/resolve-frontmatter.js'
import { readFileSync } from 'fs'
import { join } from 'path'

const rulesRoot = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const read = (family, slug) => readFileSync(slug === 'rulebook'
  ? join(rulesRoot, family, 'content', 'rulebook.md')
  : join(rulesRoot, family, 'content', 'variants', `${slug}.md`), 'utf8')
const resolved = resolveVariantSync('shogi', 'hex-shogi-91', read)
const variantConfig = resolved.plugins.shogi

// engine#172. Hex Shogi 91 was filed under "non-square boards" and assumed to
// need a renderer or a topology. It needed neither: the hex topology exists and
// the board built correctly. What it could not do was generate a move, because
// the plugin walked the board with `for (let i = 0; i < board.length; i++)` and
// a hex board is a map keyed by axial strings like "-5,5". That loop runs zero
// times and reports no legal moves rather than an error.
//
// Rules and movement from
// https://www.chessvariants.com/hexagonal.dir/hexshogi/hexshogi91.html, reached
// with a browser User-Agent on 2026-09-09.

let game
beforeAll(async () => { game = await createGameForFamily('shogi', { variant: 'hex-shogi-91' }) })

const board = () => game.getState().slice.board
const at = (key) => board()[key]
const movesFrom = (key) => game.getLegalMoves().filter(m => m.from === key).map(m => m.to).sort()

test('the board is a map of axial keys, not an array', () => {
  expect(Array.isArray(board())).toBe(false)
  expect(Object.keys(board())).toContain('-5,5')
})

test('twenty pieces a side', () => {
  const cells = Object.values(board()).filter(Boolean)
  expect(cells.filter(c => c.owner === 0)).toHaveLength(20)
  expect(cells.filter(c => c.owner === 1)).toHaveLength(20)
})

test('a pawn has two forward squares, not one', () => {
  // "A Pawn moves and captures one space orthogonally forward. On a Hex Shogi
  // board, this gives it two different spaces it can move to."
  expect(at('-5,2')).toMatchObject({ type: 'pawn', owner: 0 })
  expect(movesFrom('-5,2')).toHaveLength(2)
})

test('the king reaches twelve squares from the middle of an empty board', () => {
  // "The King can move to any adjacent hexagon, whether orthogonally or
  // diagonally adjacent. This gives it up to 12 spaces it can move to."
  const topology = createHexTopology({ shape: 'hexagonal', radius: 5, orientation: 'pointy' })
  const plugin = createShogiPlugin(variantConfig)
  plugin.init({}, { request: (what) => (what === 'core.topology' ? topology : null) })

  const cleared = {}
  for (const key of topology.getAllCells()) cleared[key] = null
  cleared['0,0'] = { type: 'king', owner: 0 }
  cleared['5,-5'] = { type: 'king', owner: 1 }

  const moves = plugin.getLegalMoves({ board: cleared, hands: [[], []] }, { __players: { currentIndex: 0 } })
  expect(moves.filter(m => m.from === '0,0')).toHaveLength(12)
})

test('the rook and bishop are mirrored between the sides, not half-turned', () => {
  // Shogi half-turns its array, which puts the two rooks on opposite sides of
  // the diagram. The published image for this game shows both rooks at the same
  // horizontal position, so the array is mirrored across the ranks.
  expect(at('-4,4')).toMatchObject({ type: 'rook', owner: 0 })
  expect(at('0,4')).toMatchObject({ type: 'bishop', owner: 0 })
  expect(at('0,-4')).toMatchObject({ type: 'rook', owner: 1 })
  expect(at('4,-4')).toMatchObject({ type: 'bishop', owner: 1 })
})

test('it plays', () => {
  let plies = 0
  for (; plies < 60; plies++) {
    const moves = game.getLegalMoves()
    if (!moves.length) break
    game.applyMove(moves[plies % moves.length])
  }
  expect(plies).toBe(60)
})
