// A game state drawn as SVG, the way the play page draws it.
//
// This used a board renderer of its own that knew one piece shape - a lettered
// disc - and nothing of the frontmatter a variant draws itself with. Backgammon
// came back as a board with no checkers, every card and tile game threw "no
// topology layout", and the piece sets, surfaces and ops a variant declares
// were ignored. The SDK now goes the play page's way: a board is written back
// to the variant's own setup notation and drawn by renderFromEngine; a table of
// cards, tiles or dice is projected for a seat and drawn by renderTableState.

import { renderFromEngine, attachPieceImages, renderTableState, serializeLayout } from '../../render/index.js'
import { fileLabel, intersectionLabel } from '../../core/index.js'
import { getDeckConfig } from '../../component-deck/index.js'
import { createGameForFamily, resolveFromDisk } from './play.js'
import { findFamilyPlugin, familySliceKey } from './find-plugin.js'
import { boardToSetup } from './serialise.js'

/**
 * @param {string} family
 * @param {object|null} state   a state from game.getState(), or null for the opening
 * @param {object} [opts]
 * @param {string} [opts.variant]
 * @param {object} [opts.definition]  a definition from definitionFromResolved
 * @param {object} [opts.resolved]    the variant's resolved frontmatter; read from
 *                                    the rules reader when omitted
 * @param {object} [opts.content]    the board data file a variant names under
 *                                    content.source (the Landlord's Game)
 * @param {object[]} [opts.gallery]   pieces/gallery-index.json, for piece and card artwork
 * @param {string} [opts.assetBase]   where artwork paths resolve, e.g.
 *                                    'https://engine.moddable.games/'
 * @param {number} [opts.seat]        whose view of a card table (default 0)
 * @param {Array}  [opts.highlights]  cell ids, or { key, color }; a grid also takes indices
 * @param {boolean} [opts.flipped]
 */
export function renderStateAsSvg(family, state, opts = {}) {
  const game = createGameForFamily(family, {
    variant: opts.variant,
    definition: opts.definition,
    rngSeed: opts.rngSeed || 42,
  })
  if (state) game.loadState(state)

  const raw = game.raw
  const plugin = findFamilyPlugin(raw.registry.getPlugins(), family)
  const slice = raw.getState(familySliceKey(raw.registry.getPlugins(), family))
  const resolved = withContent(opts.resolved || resolveFromDisk(family, opts.variant || raw.definition?.slug), family, opts)
  const images = artwork(resolved, opts)

  if (typeof plugin?.projectForSeat === 'function' && plugin.deckType) {
    return renderTable(plugin, slice, raw.definition.players.names, resolved, images, opts)
  }

  const topology = resolved.topology || {}
  const rendered = {
    ...resolved,
    setup: boardToSetup(slice, topology, plugin?.vocabulary || {}, { players: raw.definition.players.names }),
  }
  const svg = renderFromEngine(rendered, {
    pieceImages: images.images || {},
    pieceSurfaceMap: images.surfaceMap || {},
    pieceSurface: images.surface || null,
    flipped: !!opts.flipped,
    highlights: cellHighlights(opts.highlights, topology, resolved.render?.idStyle),
  })
  if (!svg) throw new Error(`${family} has no board to draw`)
  return svg
}

// A board read from a data file - the Landlord's Game's spaces - names the file
// under `content.source`. Reading it is the caller's to do, with fetch or fs,
// so this stays usable in a browser; without it the board came back empty.
function withContent(resolved, family, opts) {
  if (!resolved) {
    throw new Error(`No frontmatter for ${family}${opts.variant ? '/' + opts.variant : ''}: pass opts.resolved, or set a rules reader`)
  }
  const content = resolved.content
  if (!content?.source || content.data) return resolved
  if (!opts.content) {
    throw new Error(`${family} draws its board from ${content.source}: read it (the engine serves it at data/${content.source}) and pass it as opts.content`)
  }
  return { ...resolved, content: { ...content, data: opts.content } }
}

function renderTable(plugin, slice, playerNames, resolved, images, opts) {
  const seat = Number.isInteger(opts.seat) ? opts.seat : 0
  const view = plugin.projectForSeat(slice, seat)
  const hands = (view.hands || []).map((h, i) => (i === seat && plugin.sortForDisplay ? plugin.sortForDisplay(h) : h))
  const names = playerNames.map(n => String(n).charAt(0).toUpperCase() + String(n).slice(1))
  const layout = renderTableState({
    view: { ...view, hands },
    seat,
    names,
    current: null,
    table: plugin.onTable ? plugin.onTable({ ...view, hands }, names) : [],
    card: plugin.cardOf,
    deckType: plugin.deckType,
    images: images.images || null,
  })
  return serializeLayout(layout, { title: resolved.meta?.title || resolved._variantMeta?.title })
}

// Artwork paths are written relative to a page one level below the site root
// (`../pieces/sets/...`). A consumer elsewhere names the root it serves them from.
//
// A variant that names a piece set is drawn from it, and without the gallery
// most boards come back with no pieces - chess, tafl and xiangqi among them -
// while those that draw their own stones look right. Asking every time is
// plainer than a board that is sometimes empty.
function artwork(resolved, opts) {
  if (!opts.gallery) {
    if (resolved.pieces?.set) {
      throw new Error(`This variant draws its pieces from the '${resolved.pieces.set}' set: pass opts.gallery (the engine's pieces/gallery-index.json)`)
    }
    return {}
  }
  const built = attachPieceImages(resolved, opts.gallery) || {}
  if (!opts.assetBase || !built.images) return built
  const base = opts.assetBase.endsWith('/') ? opts.assetBase : opts.assetBase + '/'
  const images = {}
  for (const [key, path] of Object.entries(built.images)) {
    images[key] = typeof path === 'string' && path.startsWith('../') ? base + path.slice(3) : path
  }
  return { ...built, images }
}

// The highlights this helper took were grid indices; the renderer marks cells
// by the ids it draws them with. A grid index becomes its id, and anything
// else is taken to be an id already.
function cellHighlights(highlights, topology, idStyle) {
  if (!Array.isArray(highlights) || !highlights.length) return []
  const { rows, cols } = topology
  const label = idStyle === 'intersection' ? intersectionLabel : fileLabel
  const idOf = (key) => (typeof key === 'number' && topology.type === 'grid' && rows && cols
    ? `${label(key % cols)}${rows - Math.floor(key / cols)}`
    : key)
  return highlights.map(h => (typeof h === 'object' && h !== null
    ? { ...h, key: idOf(h.key ?? h.cell) }
    : { key: idOf(h) }))
}

/**
 * Card, tile and domino artwork for a family, resolved through the piece set
 * its frontmatter names - the same lookup the play page's card table makes.
 *
 * @returns {{ cardUrl: (card) => string|null, backUrl: () => string|null, images: object }}
 */
export function cardArtwork(family, opts = {}) {
  const resolved = opts.resolved || resolveFromDisk(family, opts.variant)
  if (!resolved) throw new Error(`No frontmatter for ${family}: pass opts.resolved, or set a rules reader`)
  const { images = {} } = artwork(resolved, opts)
  const deck = getDeckConfig(resolved.components?.deck?.type) || {}
  return {
    images,
    cardUrl: (card) => (card?.art && images[card.art]) || null,
    backUrl: () => (deck.backArt && images[deck.backArt]) || null,
  }
}
