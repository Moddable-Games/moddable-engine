/**
 * Every piece type that starts on the board must be able to move.
 *
 * custom-piece-mobility.test.js covers only variants that declare custom
 * pieces, and only checks that a *custom* piece moves. A standard piece
 * rendered inert by a non-standard board, or a symbol mapped in vocabulary
 * with no matching entry in `pieces`, is invisible to it. Both produce a
 * variant that loads, passes every existing check, and plays the wrong game.
 *
 * This test plays each playable chess variant for a bounded number of plies
 * across several seeds and asserts that every piece type present at the start
 * generated at least one legal move for its owner along the way.
 *
 * KNOWN_INERT is a ledger, not a mute button. Every entry needs a reason.
 * A variant belongs here only when its own rules make the piece inert, or
 * when the gap is recorded on an open issue.
 */

import { createGameForFamily, setRulesReader } from '../src/play.js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const RULES = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const PLIES = 60
const SEEDS = 4

// Two variants where this check has no purchase, and saying so is more honest
// than listing their pieces.
//
// The guard asks whether a playable variant moves every piece type it starts
// with. That assumes a starting array with room in it. Tai and Taikyoku are
// solid blocks: measured at setup, 91 of Tai's 93 types and 205 of Taikyoku's
// 209 are ringed on every side by their OWN pieces, so only the front rank can
// move at all and which of the rest a bounded random playout frees is a
// property of the seed. Listing the enclosed names would be a mute button with
// extra steps; the reason is that these openings do not open. Tai's source says
// a game "may be played over several long sessions and require each player to
// make over a thousand moves".
const OPENING_IS_A_SOLID_BLOCK = new Set(['tai-shogi', 'taikyoku-shogi'])

const KNOWN_INERT = {
  // "You MUST move the weakest piece type that has a legal move." A Rook only
  // moves once nothing weaker can, which a bounded random playout rarely reaches.
  weak: ['rook'],

  // The dark spirit steps one square orthogonally RIGHT and one square
  // diagonally BACKWARD-LEFT, and nothing else. It starts on the back rank, so
  // the backward diagonal is off the board and the only square it has is
  // occupied by its own gold general until that gold moves. Two squares is the
  // whole piece: it is one of the pair - with the deva - that is nearly frozen
  // until promoted, which is what makes their promotions (Buddhist Spirit and
  // Teaching King) the strongest pieces in the game.
  'maka-dai-dai-shogi': ['dark_spirit'],


}

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
      'utf8',
    ),
    (family) => readdirSync(join(RULES, family, 'content', 'variants'))
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, '')),
  )
}

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8'))
const chessVariants = manifest.filter(e => e.playable && e.family === 'chess').map(e => e.variant)
const shogiVariants = manifest.filter(e => e.playable && e.family === 'shogi').map(e => e.variant)
const xiangqiVariants = manifest.filter(e => e.playable && e.family === 'xiangqi').map(e => e.variant)

function boardOf(game) {
  const slice = game.getState().slice || {}
  return Array.isArray(slice.board) ? slice.board : []
}

function inertTypes(slug, family = 'chess') {
  const present = new Set()
  const moved = new Set()

  for (let seed = 0; seed < SEEDS; seed++) {
    const game = createGameForFamily(family, { variant: slug, rngSeed: 2000 + seed })
    const board0 = boardOf(game)
    for (const cell of board0) {
      if (cell && cell.type) present.add(cell.type)
    }
    const plies = board0.length > 100 ? PLIES * 3 : PLIES
    for (let ply = 0; ply < plies; ply++) {
      const board = boardOf(game)
      let moves
      try { moves = game.getLegalMoves() } catch { break }
      if (!moves || !moves.length) break
      for (const move of moves) {
        const piece = board[move.from]
        if (piece && piece.type) moved.add(piece.type)
      }
      game.applyMove(moves[(ply * 17 + seed * 7) % moves.length])
    }
  }

  const allowed = new Set(KNOWN_INERT[slug] || [])
  return [...present].filter(t => !moved.has(t) && !allowed.has(t))
}

const describeOrSkip = rulesAvailable ? describe : describe.skip

describeOrSkip('piece mobility across every playable variant', () => {
  test(`all ${chessVariants.length} chess variants move every piece type they start with`, () => {
    const offenders = []
    for (const slug of chessVariants) {
      let inert
      try {
        inert = inertTypes(slug, 'chess')
      } catch (e) {
        offenders.push(`${slug} (${e.message.slice(0, 60)})`)
        continue
      }
      if (inert.length && !OPENING_IS_A_SOLID_BLOCK.has(slug)) {
        offenders.push(`${slug} (never moves: ${inert.join(', ')})`)
      }
    }
    expect(offenders).toEqual([])
  }, 600000)

  test(`all ${shogiVariants.length} shogi variants move every piece type they start with`, () => {
    const offenders = []
    for (const slug of shogiVariants) {
      let inert
      try {
        inert = inertTypes(slug, 'shogi')
      } catch (e) {
        offenders.push(`${slug} (${e.message.slice(0, 60)})`)
        continue
      }
      if (inert.length && !OPENING_IS_A_SOLID_BLOCK.has(slug)) {
        offenders.push(`${slug} (never moves: ${inert.join(', ')})`)
      }
    }
    expect(offenders).toEqual([])
  }, 600000)

  test(`all ${xiangqiVariants.length} xiangqi variants move every piece type they start with`, () => {
    const offenders = []
    for (const slug of xiangqiVariants) {
      let inert
      try {
        inert = inertTypes(slug, 'xiangqi')
      } catch (e) {
        offenders.push(`${slug} (${e.message.slice(0, 60)})`)
        continue
      }
      if (inert.length && !OPENING_IS_A_SOLID_BLOCK.has(slug)) {
        offenders.push(`${slug} (never moves: ${inert.join(', ')})`)
      }
    }
    expect(offenders).toEqual([])
  }, 600000)

  test('chu-shogi lance moves on a cleared file', () => {
    const game = createGameForFamily('shogi', { variant: 'chu-shogi', rngSeed: 99 })
    const state = game.getState()
    const slice = Object.values(state).find(s => s && s.board)
    const board = slice.board.slice()
    const cols = 12
    board[11 * cols + 0] = { type: 'lance', owner: 0 }
    for (let r = 0; r < 11; r++) board[r * cols + 0] = null
    board[0 * cols + 6] = { type: 'king', owner: 1 }
    const testSlice = { ...slice, board }
    const full = { __players: { currentIndex: 0 } }
    const moves = game.raw.registry.getPlugins()[0].getLegalMoves(testSlice, full)
    const lanceMoves = moves.filter(m => board[m.from]?.type === 'lance')
    expect(lanceMoves.length).toBeGreaterThan(0)
  })
})
