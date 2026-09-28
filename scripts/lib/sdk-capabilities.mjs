// What the SDK gives a consumer for each playable family, found by asking
// it: build the family's first playable variant, ask for an AI move, draw it.
//
// Other sites and the tools server use @moddable/engine/play directly, and
// only six families had docs saying how. This is measured rather than
// written, so the docs cannot promise what the SDK does not do.

import '../../packages/play/test-helpers/setup-rules-reader.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sdk from '../../packages/play/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'pieces', 'gallery-index.json'), 'utf8'))

// What a consumer passes: the gallery for artwork, and a board's data file
// where its frontmatter names one.
function renderOpts(family, variant) {
  const source = sdk.resolveFromDisk(family, variant)?.content?.source
  const file = source ? path.join(ROOT, 'data', source) : null
  return { variant, gallery, content: file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined }
}

// Pieces in play: on the board, or on a track kept beside it.
const occupied = (slice) => {
  const board = slice?.board
  const onBoard = board ? Object.values(board).filter(cell => cell !== null && cell !== undefined && cell !== '').length : 0
  return onBoard + (Array.isArray(slice?.positions) ? slice.positions.length : 0)
}

export function sdkCapabilities(manifest) {
  const playable = manifest.filter(e => e.playable)
  const families = [...new Set(playable.map(e => e.family))].sort()
  return families.map(family => {
    const entry = playable.find(e => e.family === family)
    const variant = entry.slug || entry.variant
    const row = { family, label: entry.familyLabel || family, variant, variants: playable.filter(e => e.family === family).length }
    try {
      const game = sdk.createGameForFamily(family, { variant, rngSeed: 1 })
      const state = game.getState()
      const plugin = sdk.findFamilyPlugin(game.raw.registry.getPlugins(), family)
      row.plugin = plugin?.sliceName || family
      row.moves = game.getLegalMoves().length > 0
      row.hidden = typeof plugin?.projectForSeat === 'function'
      row.chance = typeof plugin?.chanceOutcomes === 'function'
      try {
        row.ai = sdk.createAI(family, variant, { difficulty: 'medium', rngSeed: 1 }).search
      } catch { row.ai = null }
      // Cards, tiles and dice are drawn as a table, projected for one seat.
      row.table = sdk.getPlugin(family)?.factory?.interaction === 'cards'
      try {
        const svg = String(sdk.renderStateAsSvg(family, state, renderOpts(family, variant)))
        const marks = (svg.match(/<(image|circle|text|use)\b/g) || []).length
        // A board that holds pieces and draws none is not a rendering of it.
        row.svg = !svg.includes('<svg') ? 'no' : (occupied(state.slice) > 0 && marks === 0 ? 'board only' : 'yes')
      } catch { row.svg = 'no' }
    } catch (error) {
      row.error = error.message
    }
    return row
  })
}
