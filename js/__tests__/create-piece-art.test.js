import { readFileSync } from 'fs'
import { join } from 'path'
import { attachPieceImages, renderFromEngine } from '../../packages/render/index.js'
import { defaultState, buildResolvedFromState, frontmatterFromState } from '../create-state.js'

// engine#118 Tier C: "pick any image from any set, give it a symbol and a
// movement, place it. A dragon that moves as a nightrider on an 8x16 board."
// An emoji set keys its images by what they show, so nothing on a board could
// reach them; a defined piece now names its artwork as `set/piece`.

const gallery = JSON.parse(readFileSync(join(process.cwd(), 'pieces', 'gallery-index.json'), 'utf8'))

function dragonBoard() {
  const state = defaultState('chess')
  state.topology.rows = 8
  state.topology.cols = 16
  state.pieceSet = 'mce-chess'
  state.customPieces = [{
    name: 'dragon', symbolW: 'D', symbolB: 'd',
    spec: { betza: 'NN' },
    artW: 'fluent-emoji/dragon', artB: 'fluent-emoji/dragon',
  }]
  state.placement = { '7,4': 'K', '0,4': 'k', '7,8': 'D', '0,8': 'd' }
  return state
}

test('a piece takes its artwork from any set, by name', () => {
  const resolved = buildResolvedFromState(dragonBoard())
  expect(resolved.pieces.art).toEqual({ D: 'fluent-emoji/dragon', d: 'fluent-emoji/dragon' })
  const { images } = attachPieceImages(resolved, gallery)
  expect(images.D).toContain('fluent-emoji/dragon.svg')
  expect(images.K).toBeDefined()
  expect(renderFromEngine(resolved, { pieceImages: images })).toContain('fluent-emoji/dragon.svg')
})

test('its symbols, movement and artwork all reach the exported file', () => {
  const engine = frontmatterFromState(dragonBoard()).engine
  expect(engine.vocabulary.dragon.symbols).toEqual({ 0: 'D', 1: 'd' })
  expect(engine.plugins.chess.pieces.dragon).toEqual({ betza: 'NN' })
  expect(engine.pieces.art.D).toBe('fluent-emoji/dragon')
})

test('and the board plays: the dragon moves as a nightrider', async () => {
  const { createGameForFamily } = await import('../../packages/play/src/play.js')
  const { definitionFromResolved } = await import('../../packages/play/index.js')
  const resolved = buildResolvedFromState(dragonBoard())
  const game = createGameForFamily('chess', { definition: definitionFromResolved('chess', 'draft', resolved, {}), rngSeed: 1 })
  const from = 7 * 16 + 8
  const targets = game.getLegalMoves().filter(m => m.from === from).map(m => m.to)
  // A nightrider repeats the knight's leap along its line: (-2,-1) twice from
  // row 7, col 8 reaches row 3, col 6.
  expect(targets).toContain(3 * 16 + 6)
  expect(targets).toContain(5 * 16 + 7)
})
