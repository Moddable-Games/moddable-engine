// The create page's document model.
//
// A single serialisable object describes everything the editor holds, and one
// function turns it into the resolved engine block the renderer and the play
// page both consume. That is what makes the round-trip in engine#115 possible:
// create writes state, play reads the same state, and "Edit in Create" reads it
// back without either side re-deriving the other's shape.

import { resolveSurface, cascadeResolve } from '../packages/schema/index.js'
import { toPluginConfig, defaultRuleValues } from './create-rules.js'
import { defaultPlayers, toPlayerConfig, playersFromResolved } from './create-players.js'

const STATE_VERSION = 1

export function defaultState(family = 'chess') {
  return {
    version: STATE_VERSION,
    family,
    title: 'Custom Variant',
    topology: { type: 'grid', rows: 8, cols: 8, layout: 'cells', radius: 5, structure: 'concentric-rings', rings: 3, positions: 24, pitCols: 6 },
    render: { surface: 'wood-classic', cellColor: 'checkered', labels: true, starPoints: false, inherited: null, surfaceColors: null },
    pieceSet: '',
    pieceVocabulary: null,
    inheritedVocabulary: null,
    inheritedPieces: null,
    placement: {},
    customPieces: [],
    players: defaultPlayers(family),
    rules: defaultRuleValues(family),
  }
}

export function isGrid(state) {
  return (state?.topology?.type || 'grid') === 'grid'
}

// --- setup strings ---

export function buildSetup(state) {
  const placement = state.placement || {}
  if (!isGrid(state)) {
    return Object.entries(placement).map(([k, v]) => `${k}:${v}`).join(',')
  }
  const { rows, cols } = state.topology
  const fenRows = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const piece = placement[`${r},${c}`]
      if (piece) {
        if (empty > 0) { row += empty; empty = 0 }
        row += piece
      } else {
        empty++
      }
    }
    if (empty > 0) row += empty
    fenRows.push(row)
  }
  return fenRows.join('/')
}

// Returns a placement map, or null if the string does not fit the board.
// Applied whole or rejected whole: a partially applied setup leaves the box
// showing a string the board is not displaying.
export function parseSetup(text, { type, rows, cols }) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return {}

  if (type !== 'grid') {
    if (!trimmed.includes(':')) return null
    const next = {}
    for (const pair of trimmed.split(',')) {
      const [key, piece] = pair.split(':')
      if (!key || !piece || piece.trim().length !== 1) return null
      next[key.trim()] = piece.trim()
    }
    return next
  }

  const next = {}
  const rowStrings = trimmed.split('/')
  if (rowStrings.length !== rows) return null
  for (let r = 0; r < rows; r++) {
    let c = 0
    const run = rowStrings[r].match(/\d+|[^\d]/g) || []
    for (const token of run) {
      if (/^\d+$/.test(token)) { c += parseInt(token, 10); continue }
      if (c >= cols) return null
      next[`${r},${c}`] = token
      c++
    }
    if (c !== cols) return null
  }
  return next
}

// --- state to engine block ---

function topologyFromState(state) {
  const t = state.topology || {}
  const type = t.type || 'grid'
  const topology = { type }
  if (type === 'grid') {
    topology.rows = t.rows || 8
    topology.cols = t.cols || 8
    if (t.layout === 'intersections') topology.layout = 'intersections'
    if (Array.isArray(t.voids) && t.voids.length) topology.voids = t.voids
  } else if (type === 'hex') {
    topology.radius = t.radius || 5
    topology.shape = 'hexagonal'
  } else if (type === 'graph') {
    topology.structure = t.structure || 'concentric-rings'
    topology.params = { rings: t.rings || 3 }
  } else if (type === 'track') {
    topology.positions = t.positions || 24
  } else if (type === 'pit') {
    topology.cols = t.pitCols || 6
  }
  return topology
}

// Render keys the editor does not model but a loaded variant may carry. A go
// board's whole appearance is an `ops` program; dropping it turned Standard Go
// into a bare intersection grid with none of its colouring or star points. They
// are carried opaquely and cleared when the topology type changes, because a
// grid's drawing program means nothing on a pit board.
const INHERITED_RENDER_KEYS = ['ops', 'cellSize', 'inset', 'insetFactor', 'idStyle', 'decorations', 'zones', 'frame', 'trackStyle', 'gap']
const INHERITED_PIECE_KEYS = ['pieces', 'pieceMoves']

function renderFromState(state) {
  const t = state.topology || {}
  const r = state.render || {}
  const type = t.type || 'grid'
  const render = { ...(r.inherited || {}), labels: r.labels !== false }

  if (type === 'grid') {
    // An intersection board draws lines, not filled cells. Forcing a checker
    // pattern onto one produces a chessboard with stones sitting on the
    // corners of the squares.
    if (!render.ops) {
      render.cellColor = t.layout === 'intersections' ? 'none' : (r.cellColor || 'checkered')
      if (t.layout === 'intersections' && r.starPoints) {
        render.decorations = [{ type: 'markers', auto: 'star-points', size: 3 }]
      }
    }
  } else if (type === 'hex') {
    render.cellColor = 'tricolor'
    render.frame = 'hexagonal'
  } else if (type === 'track') {
    render.trackStyle = 'triangular-points'
    render.cellColor = 'backgammon'
  }
  return render
}

export function buildResolvedFromState(state) {
  const surfaceRef = state.render?.surface || 'wood-classic'
  const surface = resolveSurface(surfaceRef)
  const inlineColors = state.render?.surfaceColors

  const variantEngine = {
    topology: topologyFromState(state),
    surface: inlineColors ? { colors: inlineColors } : surfaceRef,
    render: renderFromState(state),
  }

  const setup = Object.keys(state.placement || {}).length ? buildSetup(state) : undefined
  if (setup) variantEngine.setup = setup
  if (state.pieceSet) {
    variantEngine.pieces = { set: state.pieceSet }
    // Go's setup uses b and w, which only reach bS and wS artwork through the
    // variant's own vocabulary. Without it a loaded template draws no stones.
    if (state.pieceVocabulary) variantEngine.pieces.vocabulary = state.pieceVocabulary
  }

  const family = state.family || 'chess'
  const pluginConfig = toPluginConfig(family, state.rules || {})

  const { players, config: playerConfig } = toPlayerConfig(family, state.players)
  variantEngine.players = players
  Object.assign(pluginConfig, playerConfig)

  const vocabulary = { ...(state.inheritedVocabulary || {}) }
  for (const key of INHERITED_PIECE_KEYS) {
    const carried = state.inheritedPieces?.[key]
    if (carried && Object.keys(carried).length) pluginConfig[key] = { ...carried }
  }
  for (const cp of (Array.isArray(state.customPieces) ? state.customPieces : [])) {
    vocabulary[cp.name] = { symbols: { 0: cp.symbolW, 1: cp.symbolB } }
    pluginConfig.pieces = { ...pluginConfig.pieces, [cp.name]: cp.spec }
  }
  if (Object.keys(vocabulary).length) variantEngine.vocabulary = vocabulary

  if (Object.keys(pluginConfig).length) {
    variantEngine.plugins = { [family]: pluginConfig }
  }

  const { resolved } = cascadeResolve({
    surface,
    family: { engine: {}, meta: { label: '' } },
    variant: { engine: variantEngine, meta: { label: state.title || 'Custom Variant' } },
  })
  return resolved
}

// --- engine block back to state ---

// Used by the template picker (load an existing variant into the editor) and by
// "Edit in Create" from the play page. Fields the editor cannot represent are
// dropped deliberately rather than half-carried: a template is a starting point,
// not a claim to be the variant it came from.
export function stateFromResolved(resolved, family, opts = {}) {
  const state = defaultState(family)
  const topo = resolved.topology || {}
  const render = resolved.render || {}

  state.title = opts.title || resolved.meta?.label || 'Custom Variant'
  state.topology.type = topo.type || 'grid'
  if (topo.rows) state.topology.rows = topo.rows
  if (topo.cols) state.topology.cols = topo.type === 'pit' ? state.topology.cols : topo.cols
  if (topo.type === 'pit' && topo.cols) state.topology.pitCols = topo.cols
  state.topology.layout = topo.layout === 'intersections' || topo.layout === 'cross' ? 'intersections' : 'cells'
  if (Array.isArray(topo.voids) && topo.voids.length) state.topology.voids = topo.voids
  if (topo.radius) state.topology.radius = topo.radius
  if (topo.structure) state.topology.structure = topo.structure
  if (topo.params?.rings) state.topology.rings = topo.params.rings
  if (topo.positions) state.topology.positions = topo.positions

  // The cascade replaces the surface reference with the resolved surface object,
  // so the name has to be read off it rather than off the original string.
  const surfaceRef = typeof resolved.surface === 'string' ? resolved.surface : resolved.surface?.name
  if (surfaceRef) state.render.surface = surfaceRef
  if (render.cellColor) state.render.cellColor = render.cellColor
  state.render.labels = render.labels !== false
  state.render.starPoints = Array.isArray(render.decorations)
    && render.decorations.some(d => d.type === 'markers' && d.auto === 'star-points')

  const inherited = {}
  for (const key of INHERITED_RENDER_KEYS) {
    if (render[key] !== undefined) inherited[key] = render[key]
  }
  state.render.inherited = Object.keys(inherited).length ? inherited : null
  if (resolved.surface && typeof resolved.surface === 'object' && resolved.surface.colors && !resolved.surface.name) {
    state.render.surfaceColors = resolved.surface.colors
  }

  if (resolved.pieces?.set) state.pieceSet = resolved.pieces.set
  if (resolved.pieces?.vocabulary) state.pieceVocabulary = resolved.pieces.vocabulary

  const setup = typeof resolved.setup === 'string' ? resolved.setup : ''
  const parsed = setup ? parseSetup(setup, { type: state.topology.type, rows: state.topology.rows, cols: state.topology.cols }) : {}
  state.placement = parsed || {}

  state.players = playersFromResolved(resolved, family)

  const pluginBlock = resolved.plugins?.[family] || {}
  const rules = defaultRuleValues(family)
  for (const key of Object.keys(rules)) {
    if (pluginBlock[key] !== undefined && typeof pluginBlock[key] !== 'function') rules[key] = pluginBlock[key]
  }
  state.rules = rules

  const inheritedVocabulary = plainEntries({ ...(resolved.vocabulary || {}), ...(pluginBlock.vocabulary || {}) })
  state.inheritedVocabulary = Object.keys(inheritedVocabulary).length ? inheritedVocabulary : null
  const inheritedPieces = {}
  for (const key of INHERITED_PIECE_KEYS) {
    const carried = plainEntries(pluginBlock[key] || {})
    if (Object.keys(carried).length) inheritedPieces[key] = carried
  }
  state.inheritedPieces = Object.keys(inheritedPieces).length ? inheritedPieces : null

  return state
}

function plainEntries(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) if (v && typeof v === 'object') out[k] = v
  return out
}
