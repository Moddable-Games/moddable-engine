import { readFileSync } from 'fs'
import { join } from 'path'
import { createShogiPlugin } from '../index.js'
import { resolveVariantSync } from '../../../play/src/resolve-frontmatter.js'

// engine#174. Chu Shogi is playable and six of its promoted pieces moved as
// the wrong piece. A promoted kirin was a Queen where the source says
// "promoting a kirin turns it into a lion, and thereafter it behaves exactly
// like the original lion"; a promoted leopard was a Flying Ox where the leopard
// promotes to a Bishop; and the Side Mover and Vertical Mover had each other's
// promoted forms. The Soaring Eagle and Horned Falcon were absent entirely, so
// the Dragon King and Dragon Horse promoted to nothing at all.
//
// Nothing could have caught that, because the only record of what each piece
// should do was prose in the same file - and the prose was wrong about the
// Flying Stag too.
//
// So this asserts the two agree. The table below is Wikipedia's own piece table
// for Chu Shogi, transcribed from
// https://en.wikipedia.org/w/index.php?title=Chu_shogi&action=raw on
// 2026-09-09, where each row prints the piece's movement in the extended Betza
// the article defines. It is compared against what the corpus actually plays,
// asked of the plugin rather than read off the frontmatter.

const SOURCE = {
  pawn: 'fW', gold: 'WfF', silver: 'FfW', copper: 'fKbW', leopard: 'FfbW',
  blind_tiger: 'FrlbW', elephant: 'FfrlW', go_between: 'fbW', lance: 'fR',
  reverse_chariot: 'fbR', side_mover: 'WrlR', vertical_mover: 'WfbR',
  bishop: 'B', rook: 'R', dragon_horse: 'BW', dragon_king: 'RF',
  kirin: 'FD', phoenix: 'WA', lion: 'NAD[aK]', queen: 'Q',

  // Promoted forms, named by the piece they come from.
  promoted_pawn: 'WfF',                       // gold general
  promoted_go_between: 'FfrlW',               // drunk elephant
  promoted_copper: 'WrlR',                    // side mover
  promoted_leopard: 'B',                      // bishop
  promoted_lance: 'fQbR',                     // white horse
  promoted_reverse_chariot: 'fRbQ',           // whale
  promoted_blind_tiger: 'fbRK',               // flying stag
  promoted_side_mover: 'BrlR',                // free boar
  promoted_vertical_mover: 'BfbR',            // flying ox
  promoted_elephant: 'K',                     // prince
  promoted_kirin: 'NAD[aK]',                  // lion
  promoted_phoenix: 'Q',                      // queen
  promoted_dragon_king: 'RbBf[avF]fA',        // soaring eagle
  promoted_dragon_horse: 'BrlbRf[avW]fD',     // horned falcon
}

const ROWS = 12, COLS = 12
const CENTRE = 5 * COLS + 5
const request = () => null
const turn = () => ({ __players: { currentIndex: 0 } })

const rulesRoot = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const read = (family, slug) => readFileSync(slug === 'rulebook'
  ? join(rulesRoot, family, 'content', 'rulebook.md')
  : join(rulesRoot, family, 'content', 'variants', `${slug}.md`), 'utf8')

const variantConfig = resolveVariantSync('shogi', 'chu-shogi', read).plugins.shogi

// Where a lone piece of this type can go on an empty board, asked of a plugin
// built the way the game builds one. `via` is part of the answer: a Lion that
// reaches a square by two steps has done something a Lion that jumps there has
// not.
function destinations(config, type) {
  const plugin = createShogiPlugin({ ...config, rows: ROWS, cols: COLS, promotionZone: 0 })
  plugin.init({}, { request })
  const board = new Array(ROWS * COLS).fill(null)
  board[CENTRE] = { type, owner: 0 }
  board[0] = { type: 'king', owner: 0 }
  board[ROWS * COLS - 1] = { type: 'king', owner: 1 }
  const slice = { board, hands: [[], []], _cols: COLS }
  return [...new Set(
    plugin.getLegalMoves(slice, turn())
      .filter(m => m.from === CENTRE)
      .map(m => `${m.to}${m.via !== undefined ? `:${m.via}` : ''}`)
  )].sort()
}

describe('chu-shogi plays what its source describes', () => {
  test.each(Object.entries(SOURCE))('%s moves as %s', (type, betza) => {
    const fromSource = destinations({ pieceMoves: { [type]: { betza } } }, type)
    const fromCorpus = destinations(variantConfig, type)
    expect(fromSource.length).toBeGreaterThan(0)
    expect(fromCorpus).toEqual(fromSource)
  })
})
