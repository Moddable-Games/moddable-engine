import '../test-helpers/setup-rules-reader.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createGameForFamily, resolveFromDisk } from '../src/play.js'
import { renderStateAsSvg } from '../src/render-helper.js'

// engine#200. Every piece a game shows is a picture from the piece gallery.
// The renderers used to draw a stone, a draughtsman, a seed or a token as a
// shape when no picture resolved, so a variant could lose its artwork and still
// look played. Those shapes are gone: a piece without a picture is not drawn.
// This asks the question the other way round. A position with pieces in play,
// part way through a game, must draw gallery pictures.

const ROOT = process.cwd()
const gallery = JSON.parse(readFileSync(join(ROOT, 'pieces', 'gallery-index.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(ROOT, 'play', 'playability-manifest.json'), 'utf8'))
const boards = manifest.filter(e => e.playable && !e.path)

// Pieces in play: on the board, in stacks, or on a track beside it.
function inPlay(slice) {
  const board = slice?.board
  let n = Array.isArray(slice?.positions) ? slice.positions.length : 0
  for (const cell of board ? Object.values(board) : []) {
    if (cell === null || cell === undefined || cell === '' || cell === 0) continue
    n += typeof cell === 'number' ? cell : (cell.count || 1)
  }
  return n
}

function contentFor(family, variant) {
  const source = resolveFromDisk(family, variant)?.content?.source
  return source ? JSON.parse(readFileSync(join(ROOT, 'data', source), 'utf8')) : undefined
}

test('every playable board variant draws its pieces from the gallery, part way through a game', () => {
  expect(boards.length).toBeGreaterThan(250)
  const bare = []
  for (const entry of boards) {
    const variant = entry.slug || entry.variant
    const game = createGameForFamily(entry.family, { variant, rngSeed: 7 })
    for (let i = 0; i < 8; i++) {
      const moves = game.getLegalMoves()
      if (!moves.length || game.checkWin?.() != null) break
      game.applyMove(moves[(i * 7) % moves.length])
    }
    const state = game.getState()
    if (!inPlay(state.slice)) continue
    const svg = renderStateAsSvg(entry.family, state, { variant, gallery, content: contentFor(entry.family, variant) })
    if (!/<image\b/.test(svg)) bare.push(`${entry.family}/${variant}`)
  }
  expect(bare).toEqual([])
}, 300000)
