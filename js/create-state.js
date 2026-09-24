import { readPosition, writePosition } from '../packages/core/index.js'
// The create page's document model.
//
// A single serialisable object describes everything the editor holds, and one
// function turns it into the resolved engine block the renderer and the play
// page both consume. That is what makes the round-trip in engine#115 possible:
// create writes state, play reads the same state, and "Edit in Create" reads it
// back without either side re-deriving the other's shape.

import { resolveSurface, cascadeResolve } from '../packages/schema/index.js'
import { toPluginConfig, defaultRuleValues, fitsField } from './create-rules.js'
import { defaultPlayers, toPlayerConfig, playersFromResolved } from './create-players.js'
import { applyEdits, clone } from './create-carry.js'
import { createTopology } from '../packages/play/index.js'

// 2: the loaded variant is carried whole as `source` (create-carry.js), in
// place of the render, vocabulary and piece keys version 1 carried one by one.
const STATE_VERSION = 2

export function defaultState(family = 'chess') {
  return {
    version: STATE_VERSION,
    family,
    title: 'Custom Variant',
    slug: '',
    win: '',
    special: '',
    topology: { type: 'grid', rows: 8, cols: 8, radius: 5, sideLength: 12, structure: 'concentric-rings', rings: 3, positions: 24, pitCols: 6 },
    render: { surface: 'wood-classic', cellColor: 'checkered', labels: true, starPoints: false },
    pieceSet: '',
    placement: {},
    customPieces: [],
    players: defaultPlayers(family),
    rules: defaultRuleValues(family),
    // Frontmatter keys beside `engine` that the editor does not model - board,
    // players, parent and the like - carried through to the export.
    meta: {},
    // What a loaded variant declares that no control writes, block by block:
    // `plugin` is the family's plugin block, `engine` the engine block's own
    // top level. Shown and edited as "other settings".
    extra: emptyExtra(),
    // The loaded variant's engine block and the editor's view of it at load.
    // Null for a board started from scratch.
    source: null,
  }
}

export function emptyExtra() {
  return { topology: {}, render: {}, pieces: {}, plugin: {}, engine: {} }
}

export function isGrid(state) {
  return (state?.topology?.type || 'grid') === 'grid'
}

// --- setup strings ---
//
// The placement map holds a symbol per cell: `row,col` on a grid (`row,col,layer`
// on the second and later boards of a layered one), and the cell's own id on
// anything else. Setups are read and written by core's `readPosition` and
// `writePosition`, the one reader and writer every other part of the engine uses.
// The page used to keep its own, and they could not read a four-player board, a
// hex board's coordinates or a board of several layers, so those variants could
// be loaded but not placed on.

// How a setup was written, so one the user has not touched goes back out in the
// same form: comma-separated ranks, one string per board, and any fields after
// the position.
export function setupFormOf(setup) {
  const first = Array.isArray(setup) ? setup[0] : setup
  if (typeof first !== 'string') return {}
  const [position, ...rest] = first.split(' ')
  const form = {}
  if (position.includes('/') && position.split('/').some(rank => rank.includes(','))) form.commas = true
  if (Array.isArray(setup)) form.array = true
  if (rest.length) form.suffix = rest.join(' ')
  return form
}

export function buildSetup(state) {
  const placement = state.placement || {}
  // A setup nobody has touched goes back out exactly as it came in. Two ways of
  // writing one position are one position, but a file should not change for
  // being opened.
  const original = state.setupOriginal
  if (original && JSON.stringify(original.placement) === JSON.stringify(placement)) return clone(original.setup)
  if (!isGrid(state)) {
    return Object.entries(placement).map(([k, v]) => `${k}:${v}`).join(',')
  }
  const { rows, cols } = state.topology
  const layers = Math.max(1, state.topology.layers || 1)
  const form = state.setupForm || {}
  const boards = []
  for (let layer = 0; layer < layers; layer++) {
    const ranks = []
    for (let r = 0; r < rows; r++) {
      const cells = []
      for (let c = 0; c < cols; c++) cells.push(placement[placementKey(r, c, layer)] || null)
      ranks.push(cells)
    }
    boards.push(writePosition(ranks, { commas: !!form.commas, promotion: true }) + (form.suffix ? ` ${form.suffix}` : ''))
  }
  return layers > 1 || form.array ? boards : boards[0]
}

export function placementKey(row, col, layer = 0) {
  return layer ? `${row},${col},${layer}` : `${row},${col}`
}

// Returns a placement map, or null if the setup does not fit the board.
// Applied whole or rejected whole: a partially applied setup leaves the box
// showing a string the board is not displaying.
export function parseSetup(setup, { type, rows, cols, layers = 1 }) {
  if (type !== 'grid') return typeof setup === 'string' ? parseCellList(setup) : null

  // A layered board's setup is one position per board, written in the setup
  // box as `first | second`.
  const boards = Array.isArray(setup) ? setup
    : String(setup || '').includes('|') ? String(setup).split('|')
    : [setup]
  if (boards.length > Math.max(1, layers)) return null
  const next = {}
  for (let layer = 0; layer < boards.length; layer++) {
    const text = String(boards[layer] ?? '').trim()
    if (!text) continue
    const { cells, widths, rankCount } = readPosition(text)
    if (rankCount !== rows) return null
    if (widths.length !== rows || widths.some(w => w !== cols)) return null
    for (const { row, col, symbol, promoted } of cells) {
      if (col >= cols) return null
      next[placementKey(row, col, layer)] = promoted ? `+${symbol}` : symbol
    }
  }
  return next
}

// `cell:symbol` pairs, where a cell id may itself hold a comma - a hex cell is
// `q,r` - so a pair runs to the next colon, not the next comma.
function parseCellList(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return {}
  if (!trimmed.includes(':')) return null
  const next = {}
  let pending = []
  for (const token of trimmed.split(',')) {
    pending.push(token)
    if (!token.includes(':')) continue
    const entry = pending.join(',')
    pending = []
    const at = entry.lastIndexOf(':')
    const key = entry.slice(0, at).trim()
    const symbol = entry.slice(at + 1).trim()
    if (!key || !symbol) return null
    next[key] = symbol
  }
  return pending.length ? null : next
}

// The setup as the setup box shows it.
export function setupText(setup) {
  if (Array.isArray(setup)) return setup.join(' | ')
  return typeof setup === 'string' ? setup : ''
}

// --- state to engine block ---

// The fields a block's controls write. Whatever else a loaded block carries is
// held in `state.extra` - shown in the page's "other settings" and written back
// as it was - so a board built with the controls can say anything a variant in
// the corpus says (engine#118).
const TOPOLOGY_FIELDS = {
  grid: ['rows', 'cols', 'layout', 'voids', 'blockers', 'layers', 'wrap'],
  hex: ['shape', 'rows', 'cols', 'radius', 'sideLength', 'grid', 'orientation'],
  graph: ['structure'],
  track: ['positions'],
  pit: ['cols', 'rows'],
}

// Each field is written only where it is set. A control that wrote its own
// default into every board changed boards that never asked for it: a hex board
// given `shape: hexagonal` is given a hexagonal frame by the cascade.
function topologyFromState(state) {
  const t = state.topology || {}
  const type = t.type || 'grid'
  const topology = { ...clone(state.extra?.topology || {}), type }
  if (type === 'grid') {
    topology.rows = t.rows || 8
    topology.cols = t.cols || 8
    if (t.layout) topology.layout = t.layout
    if (Array.isArray(t.voids) && t.voids.length) topology.voids = t.voids
    if (Array.isArray(t.blockers) && t.blockers.length) topology.blockers = t.blockers
    if (t.layers !== undefined) topology.layers = t.layers
    if (t.wrap !== undefined) topology.wrap = t.wrap
  } else if (type === 'hex') {
    // Rhombus and triangular boards arrived with the hex plugin, and this once
    // dropped their dimensions: every Hex and Y variant round-tripped through
    // the page as an empty board.
    if (t.shape) topology.shape = t.shape
    // A hex board with cells missing is declared by the cells it has.
    if (Array.isArray(t.grid)) topology.grid = t.grid
    if (t.orientation !== undefined) topology.orientation = t.orientation
    if (t.shape === 'triangular') topology.sideLength = t.sideLength || 12
    else if (t.shape !== 'rhombus' && t.radius) topology.radius = t.radius
    // A rhombus may be declared by `rows` and `cols` or by `size`, which is
    // held as an other setting.
    if (t.rows) topology.rows = t.rows
    if (t.cols) topology.cols = t.cols
  } else if (type === 'graph') {
    topology.structure = t.structure || 'concentric-rings'
    topology.params = { ...(topology.params || {}), rings: t.rings || 3 }
  } else if (type === 'track') {
    topology.positions = t.positions || 24
  } else if (type === 'pit') {
    topology.cols = t.pitCols || 6
    // Bao gives each player two rows. Dropping `rows` turned it back into an
    // ordinary two-row board on the way out of the editor.
    if (t.pitRows) topology.rows = t.pitRows
  }
  return topology
}

// A loaded variant's own drawing program. The editor does not model these, and
// they win over the controls that do: a go board's whole appearance is an `ops`
// program. So when the user picks a surface or a cell style of their own, these
// are dropped from the carried source - otherwise the choice would change the
// file and not the board.
const DRAWING_PROGRAM_KEYS = ['ops', 'cellSize', 'inset', 'insetFactor', 'decorations', 'zones', 'frame', 'trackStyle', 'gap']

// A fresh board's look, per topology type. A loaded board keeps its own.
const RENDER_DEFAULTS = {
  grid: { cellColor: 'checkered', labels: true },
  hex: { cellColor: 'tricolor', frame: 'hexagonal' },
  track: { trackStyle: 'triangular-points', cellColor: 'backgammon' },
}

function renderDefaultsFor(type) {
  return { ...(RENDER_DEFAULTS[type] || {}) }
}

function renderFromState(state) {
  const t = state.topology || {}
  const r = state.render || {}
  const render = { ...clone(state.extra?.render || {}) }

  const holes = holesOf(t)
  if (holes.length) {
    const original = r.holesOriginal
    const voids = original && original.holes === cellsKey(holes) ? original.voids : sortCells(holes)
    render.zones = { ...(render.zones || {}), voids }
  }
  if (Array.isArray(r.tints) && r.tints.length) {
    render.decorations = [...(render.decorations || []), ...clone(r.tints)]
  }
  if (r.labels !== undefined) render.labels = r.labels !== false
  if (r.frame !== undefined) render.frame = r.frame
  if (r.trackStyle !== undefined) render.trackStyle = r.trackStyle

  if (r.cellColor !== undefined) render.cellColor = r.cellColor
  if (r.starPoints) {
    render.decorations = [...(render.decorations || []), { type: 'markers', auto: 'star-points', size: 3 }]
  }
  return render
}

// The engine block as the editor's own controls describe it, and nothing else.
// `explicitRules` writes every rule value, defaults included: a merge needs to
// see a rule set back to its default as a change, because the family's own
// default may not be the form's (draughts' `forcedCapture` is the case that
// lost fifteen variants their rule).
function engineFromState(state, { explicitRules = false } = {}) {
  const extra = state.extra || emptyExtra()
  const engine = clone(extra.engine || {})
  engine.topology = topologyFromState(state)
  if (state.render?.surface !== undefined) engine.surface = clone(state.render.surface)
  engine.render = renderFromState(state)

  const setup = Object.keys(state.placement || {}).length ? buildSetup(state) : state.rawSetup
  if (setup !== undefined && setup !== null) engine.setup = clone(setup)
  else delete engine.setup

  const pieces = clone(extra.pieces || {})
  if (state.pieceSet) pieces.set = state.pieceSet
  if (Object.keys(pieces).length) engine.pieces = pieces

  const family = state.family || 'chess'
  const pluginConfig = toPluginConfig(family, state.rules || {}, { explicit: explicitRules, declared: state.rulesDeclared || [] })

  const { players, config: playerConfig } = toPlayerConfig(family, state.players)
  engine.players = players
  Object.assign(pluginConfig, playerConfig)

  // A setting held in `extra` is one the controls could not say, or one the
  // user set by hand, and it stands over what they say.
  Object.assign(pluginConfig, clone(extra.plugin || {}))

  // A defined piece is a vocabulary entry (its symbols), a plugin piece (its
  // movement), and, where artwork was chosen for it, `pieces.art`.
  const vocabulary = clone(engine.vocabulary || {})
  const art = {}
  for (const cp of (Array.isArray(state.customPieces) ? state.customPieces : [])) {
    vocabulary[cp.name] = { symbols: { 0: cp.symbolW, 1: cp.symbolB } }
    pluginConfig.pieces = { ...pluginConfig.pieces, [cp.name]: cp.spec }
    if (cp.artW) art[cp.symbolW] = cp.artW
    if (cp.artB) art[cp.symbolB] = cp.artB
  }
  if (Object.keys(vocabulary).length) engine.vocabulary = vocabulary
  if (Object.keys(art).length) engine.pieces = { ...(engine.pieces || {}), art: { ...(engine.pieces?.art || {}), ...art } }

  if (Object.keys(pluginConfig).length) engine.plugins = { [family]: pluginConfig }
  else delete engine.plugins
  return engine
}

// --- control transitions ---
//
// What a control does to the rest of the board when it changes, kept here so it
// is the same wherever the change comes from and can be tested without a page.

// A board of another shape shares nothing with the loaded one: its drawing
// program, setup and piece definitions all address cells that are gone. It
// starts from that shape's own look.
export function setTopologyType(state, type) {
  state.topology.type = type
  state.placement = {}
  delete state.rawSetup
  state.source = null
  state.extra = { ...emptyExtra(), plugin: state.extra?.plugin || {}, engine: state.extra?.engine || {} }
  const surface = state.render?.surface
  state.render = { surface, starPoints: false, ...renderDefaultsFor(type) }
  if (type === 'hex' && !state.topology.radius && !state.topology.shape) state.topology.radius = 5
}

// The user has chosen how the board looks, so the loaded variant's own drawing
// program stops applying: it wins over the controls, and left in place the
// choice would change the file and not the board.
export function overrideLook(state) {
  const render = state.source?.engine?.render
  if (render) for (const key of DRAWING_PROGRAM_KEYS) delete render[key]
  if (state.source?.engine && typeof state.source.engine.surface === 'object') delete state.source.engine.surface
  const extra = state.extra?.render
  if (extra) for (const key of DRAWING_PROGRAM_KEYS) delete extra[key]
  delete state.render.inherited
  delete state.render.surfaceColors
}

// A hex board of another shape is measured another way: a hexagon by its
// radius, a rhombus by rows and columns, a triangle by its side.
export function setHexShape(state, shape) {
  const t = state.topology
  if (shape) t.shape = shape
  else delete t.shape
  delete t.grid
  if (shape === 'rhombus') { t.rows = t.rows || 11; t.cols = t.cols || 11; delete t.radius }
  else if (shape === 'triangular') { t.sideLength = t.sideLength || 12; delete t.radius; delete t.rows; delete t.cols }
  else { t.radius = t.radius || 5; delete t.rows; delete t.cols }
  state.placement = {}
}

// An intersection board draws lines, not filled cells: a checker fill under it
// is a chessboard with stones on the corners of the squares.
export function setGridLayout(state, layout) {
  const wasIntersections = state.topology.layout === 'intersections'
  state.topology.layout = layout
  if (layout === 'intersections' && state.render.cellColor === 'checkered') state.render.cellColor = 'none'
  else if (wasIntersections && layout !== 'intersections' && state.render.cellColor === 'none') state.render.cellColor = 'checkered'
}

// --- the cell brush ---
//
// Paints the cells of a board: a void is a cell that does not exist, a blocker
// one that exists and cannot be entered, and a tint is colour laid on it. The
// semantics are conventions.md's; the page only says which cells.

function holesOf(topology) {
  return [...(topology?.voids || []), ...(topology?.blockers || [])]
}

function isPaintedTint(d) {
  return d?.type === 'tint' && Array.isArray(d.cells) && !d.region
}

function cellsKey(cells) {
  return sortCells(cells).map(c => c.join(',')).join('|')
}

function sameCells(a, b) {
  return a.length === b.length && cellsKey(a) === cellsKey(b)
}

function sortCells(cells) {
  return [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

// `brush` is 'void', 'blocker', 'clear', or a tint: { fill, opacity }. Painting
// a cell with what it already has clears it. Returns whether anything changed.
export function paintCell(state, key, brush) {
  const t = state.topology
  if (t.type === 'hex') return paintHexCell(state, key, brush)
  if (t.type !== 'grid') return false
  const [r, c] = key.split(',').map(Number)
  if (!Number.isInteger(r) || !Number.isInteger(c)) return false
  const at = ([rr, cc]) => rr === r && cc === c
  const without = list => (list || []).filter(cell => !at(cell))
  const had = {
    void: (t.voids || []).some(at),
    blocker: (t.blockers || []).some(at),
  }
  const tints = (state.render.tints || []).map(tint => ({ ...tint, cells: without(tint.cells) })).filter(tint => tint.cells.length)

  t.voids = without(t.voids)
  t.blockers = without(t.blockers)
  state.render.tints = tints
  if (brush === 'void' && !had.void) {
    t.voids = [...t.voids, [r, c]]
    delete state.placement[key]
  } else if (brush === 'blocker' && !had.blocker) {
    t.blockers = [...t.blockers, [r, c]]
    delete state.placement[key]
  } else if (brush && typeof brush === 'object') {
    const same = state.render.tints.find(tint => tint.fill === brush.fill && (tint.opacity ?? 0.3) === (brush.opacity ?? 0.3))
    if (same) same.cells = [...same.cells, [r, c]]
    else state.render.tints = [...state.render.tints, { type: 'tint', fill: brush.fill, opacity: brush.opacity ?? 0.3, cells: [[r, c]] }]
  }
  if (!t.voids.length) delete t.voids
  if (!t.blockers.length) delete t.blockers
  if (!state.render.tints.length) delete state.render.tints
  return true
}

// A hex cell is removed by listing the cells the board keeps.
function paintHexCell(state, key, brush) {
  if (brush !== 'void') return false
  const topology = previewTopologyOf(state)
  const cells = Array.isArray(state.topology.grid)
    ? state.topology.grid.map(c => (Array.isArray(c) ? c.join(',') : String(c)))
    : (topology?.getAllCells?.() || [])
  if (!cells.includes(key)) return false
  state.topology.grid = cells.filter(c => c !== key).map(c => c.split(',').map(Number))
  delete state.placement[key]
  return true
}

function previewTopologyOf(state) {
  try { return createTopology(topologyFromState({ ...state, topology: { ...state.topology, grid: undefined } })) } catch { return null }
}

// Every cell back: no voids, blockers or tints, and a hex board whole again.
export function restoreAllCells(state) {
  delete state.topology.voids
  delete state.topology.blockers
  delete state.topology.grid
  delete state.render.tints
}

// The variant's engine block: the carried source with the user's edits applied,
// or, for a board started from scratch, the controls' own description of it.
function variantEngineFromState(state) {
  const source = sourceOf(state)
  if (!source) return engineFromState(state)

  const current = engineFromState(state, { explicitRules: true })
  const engine = applyEdits(source.engine, source.baseline, current)

  // Play folds an engine block's top-level rule keys into the plugin config and
  // lets them win (`resolveMeta`), so a rule edited in the form and written to
  // the plugin block would lose to an older copy of itself one level up.
  const family = state.family || 'chess'
  const before = source.baseline.plugins?.[family] || {}
  const after = current.plugins?.[family] || {}
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
    if (key in engine && !ENGINE_STRUCTURAL_KEYS.has(key)) delete engine[key]
  }
  return engine
}

// The engine keys play does not treat as plugin config: `STRUCTURAL_KEYS` in
// packages/play, plus the two the editor writes at the top level itself.
const ENGINE_STRUCTURAL_KEYS = new Set(['topology', 'players', 'firstPlayer', 'turnOrder', 'meta', 'surface', 'render', 'components', 'plugins', 'pieces', 'setup', 'vocabulary'])

// The engine keys the page's own controls write. Every other top-level key -
// a turn order, a vocabulary, a first player - is held as an other setting.
const ENGINE_OWNED_KEYS = new Set(['topology', 'surface', 'render', 'setup', 'pieces', 'players', 'plugins', 'meta'])

// Drafts saved before version 2 carried the variant's drawing program, its
// vocabulary and its piece definitions as three separate fields. They are the
// source such a draft was loaded from, with every control counted as an edit.
function sourceOf(state) {
  if (state.source) return state.source
  const render = state.render?.inherited
  const vocabulary = state.inheritedVocabulary
  const pieces = state.inheritedPieces
  if (!render && !vocabulary && !pieces && !state.pieceVocabulary && !state.render?.surfaceColors) return null
  const engine = {}
  if (render) engine.render = clone(render)
  if (state.render?.surfaceColors) engine.surface = { colors: clone(state.render.surfaceColors) }
  if (vocabulary) engine.vocabulary = clone(vocabulary)
  if (state.pieceVocabulary) engine.pieces = { vocabulary: clone(state.pieceVocabulary) }
  if (pieces) engine.plugins = { [state.family || 'chess']: clone(pieces) }
  return { engine, baseline: {} }
}

export function buildResolvedFromState(state) {
  const engine = variantEngineFromState(state)
  // The surface as the file declares it: a name, a `{ base, colors }` override
  // or an inline palette. `resolveSurface` reads all three.
  const surface = resolveSurface(declaredSurface(engine.surface) || 'wood-classic')
  const { surface: _declared, ...variantEngine } = engine

  const { resolved } = cascadeResolve({
    surface,
    family: { engine: {}, meta: { label: '' } },
    variant: { engine: variantEngine, meta: { label: state.title || 'Custom Variant' } },
  })
  return resolved
}

// A surface the cascade resolved carries its `name`, and the colours of that
// named surface with whatever the variant laid over them. The declaration is the
// name, and the colours that differ from it. Anything without a name -
// `{ base, colors }` or an inline palette - is already a declaration.
function declaredSurface(surface) {
  if (!surface || typeof surface !== 'object' || !surface.name) return surface
  const named = resolveSurface(surface.name)
  const colors = {}
  for (const [key, value] of Object.entries(surface.colors || {})) {
    if (named.colors?.[key] !== value) colors[key] = value
  }
  return Object.keys(colors).length ? { base: surface.name, colors } : surface.name
}

// The whole frontmatter an export writes: the metadata block, whatever other
// top-level keys the loaded file carried, and the engine block.
export function frontmatterFromState(state) {
  const meta = { ...clone(state.meta || {}) }
  const title = state.title || 'Custom Variant'
  meta.title = title
  meta.slug = state.slug || slugify(title)
  if (state.win) meta.win = state.win
  else delete meta.win
  if (state.special) meta.special = state.special
  else delete meta.special
  meta.parent = state.family || 'chess'

  const engine = variantEngineFromState(state)
  if (engine.surface !== undefined) engine.surface = declaredSurface(engine.surface)
  meta.engine = engine
  return meta
}

export function slugify(s) {
  return String(s || 'custom-variant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-variant'
}

// --- engine block back to state ---

// Used by the template picker (load an existing variant into the editor), by
// import, and by "Edit in Create" from the play page. The controls read what
// they model; the block itself is kept whole as the source, so what they do not
// model is carried rather than dropped.
//
// `opts.source` is the variant's own engine block where the caller has it
// (import reads it straight from the file). Without it the resolved block is
// carried, less what the cascade added for its own use.
export function stateFromResolved(resolved, family, opts = {}) {
  const state = defaultState(family)
  const source = opts.source ? clone(opts.source) : carriedFromResolved(resolved)
  if (opts.surface !== undefined) source.surface = clone(opts.surface)

  state.title = opts.title || resolved.meta?.label || 'Custom Variant'
  state.slug = opts.slug || resolved.meta?.slug || ''
  state.win = opts.win || resolved.meta?.win || ''
  state.special = opts.special || resolved.meta?.special || ''
  if (opts.meta) state.meta = clone(opts.meta)

  const extra = emptyExtra()
  readTopology(state, source.topology || resolved.topology || {}, extra)
  readRender(state, source.render || {}, extra)

  state.render.surface = source.surface !== undefined ? declaredSurface(clone(source.surface)) : undefined
  for (const [key, value] of Object.entries(source.pieces || {})) {
    if (key === 'set') state.pieceSet = value
    else extra.pieces[key] = clone(value)
  }

  // The setup is read into the board where the page can place on it, and kept
  // as written where it cannot.
  const setup = source.setup ?? resolved.setup
  const readable = (typeof setup === 'string' && setup) || (Array.isArray(setup) && setup.length)
  const parsed = readable
    ? parseSetup(setup, { type: state.topology.type, rows: state.topology.rows, cols: state.topology.cols, layers: state.topology.layers })
    : null
  if (parsed && Object.keys(parsed).length) {
    state.placement = parsed
    state.setupForm = setupFormOf(setup)
    state.setupOriginal = { placement: clone(parsed), setup: clone(setup) }
  } else if (setup !== undefined) {
    state.rawSetup = clone(setup)
  }

  // Top-level rule keys count, and win, exactly as they do in play.
  const pluginBlock = clone(source.plugins?.[family] || {})
  const topLevel = {}
  for (const [key, value] of Object.entries(source)) {
    if (!ENGINE_OWNED_KEYS.has(key) && value !== undefined) topLevel[key] = clone(value)
  }
  const ruleView = { ...pluginBlock }
  for (const [key, value] of Object.entries(topLevel)) {
    if (!ENGINE_STRUCTURAL_KEYS.has(key)) ruleView[key] = value
  }

  state.players = playersFromResolved({ players: source.players ?? resolved.players, plugins: { [family]: ruleView } }, family)

  const rules = defaultRuleValues(family)
  const declared = []
  for (const key of Object.keys(rules)) {
    const value = ruleView[key]
    if (value === undefined || typeof value === 'function') continue
    if (!fitsField(family, key, value)) continue
    rules[key] = value
    declared.push(key)
    // Held by its control now, in the plugin block, which is where an edit to
    // it goes. Left at the top level too it would win over that edit.
    delete pluginBlock[key]
    delete topLevel[key]
  }
  state.rules = rules
  state.rulesDeclared = declared

  // What the players panel says, if it says exactly what the variant does.
  const { config: playerConfig } = toPlayerConfig(family, state.players)
  for (const key of ['playerCount', 'advancement']) {
    if (JSON.stringify(ruleView[key]) === JSON.stringify(playerConfig[key])) {
      delete pluginBlock[key]
      delete topLevel[key]
    } else if (state.players.declared) {
      state.players.declared[key] = false
    }
  }

  extra.plugin = pluginBlock
  extra.engine = topLevel
  state.extra = extra

  state.source = { engine: source, baseline: engineFromState(state, { explicitRules: true }) }
  return state
}

// The topology fields the controls hold, read as declared. The rest of the
// block is held as it is.
function readTopology(state, topo, extra) {
  const type = topo.type || 'grid'
  const t = { type }
  const owned = new Set(['type', ...(TOPOLOGY_FIELDS[type] || [])])
  if (type === 'grid') {
    t.rows = topo.rows
    t.cols = topo.cols
    t.layout = topo.layout
    if (Array.isArray(topo.voids) && topo.voids.length) t.voids = topo.voids
    if (Array.isArray(topo.blockers) && topo.blockers.length) t.blockers = topo.blockers
    t.layers = topo.layers
    t.wrap = topo.wrap
  } else if (type === 'hex') {
    for (const key of ['shape', 'rows', 'cols', 'radius', 'sideLength', 'grid', 'orientation']) if (topo[key] !== undefined) t[key] = topo[key]
  } else if (type === 'graph') {
    t.structure = topo.structure
    t.rings = topo.params?.rings
    const { rings: _rings, ...params } = topo.params || {}
    if (Object.keys(params).length) extra.topology.params = clone(params)
    owned.add('params')
  } else if (type === 'track') {
    t.positions = topo.positions
  } else if (type === 'pit') {
    t.pitCols = topo.cols
    t.pitRows = topo.rows
  }
  for (const [key, value] of Object.entries(topo)) {
    if (!owned.has(key)) extra.topology[key] = clone(value)
  }
  // A fresh board's defaults fill the controls the variant has nothing to say
  // for; a field this type owns and the variant does not declare stays unset.
  state.topology = { ...defaultState(state.family).topology, ...t }
  const unset = type === 'grid' ? ['radius', 'sideLength', 'blockers', 'wrap'] : type === 'hex' ? ['rows', 'cols', 'radius', 'sideLength', 'shape', 'grid', 'orientation'] : []
  for (const key of [...unset, 'pitRows']) if (t[key] === undefined) delete state.topology[key]
}

const RENDER_FIELDS = new Set(['labels', 'cellColor', 'frame', 'trackStyle'])

function readRender(state, render, extra) {
  state.render = { surface: state.render.surface, starPoints: false }
  for (const [key, value] of Object.entries(render)) {
    if (RENDER_FIELDS.has(key)) state.render[key] = value
    else extra.render[key] = clone(value)
  }

  // The drawn holes are the board's voids and blockers, and CI requires the two
  // to agree (check-voids.mjs), so the page writes them from the cells it holds.
  // A pairing nobody repaints goes back out as written: the corpus orders it two
  // ways.
  const drawn = extra.render.zones?.voids
  if (Array.isArray(drawn) && sameCells(drawn, holesOf(state.topology))) {
    state.render.holesOriginal = { holes: cellsKey(holesOf(state.topology)), voids: clone(drawn) }
    const { voids: _drawn, ...zones } = extra.render.zones
    if (Object.keys(zones).length) extra.render.zones = zones
    else delete extra.render.zones
  }

  // A tint laid on a list of cells is one the page painted, and paints.
  if (Array.isArray(extra.render.decorations)) {
    const painted = extra.render.decorations.filter(isPaintedTint)
    if (painted.length) {
      state.render.tints = clone(painted)
      const rest = extra.render.decorations.filter(d => !isPaintedTint(d))
      if (rest.length) extra.render.decorations = rest
      else delete extra.render.decorations
    }
  }
  const decorations = extra.render.decorations
  if (Array.isArray(decorations)) {
    const isStarPoints = d => d?.type === 'markers' && d.auto === 'star-points' && (d.size ?? 3) === 3 && Object.keys(d).length <= 3
    if (decorations.some(isStarPoints)) {
      state.render.starPoints = true
      const rest = decorations.filter(d => !isStarPoints(d))
      if (rest.length) extra.render.decorations = rest
      else delete extra.render.decorations
    }
  }
}

// What the cascade adds for its own use is not part of the variant: its
// metadata, and the underscore-prefixed working keys (`_variantMeta`).
//
// A board read from a data file arrives with the file's contents inlined as
// `content.data`. The variant names the file; the export does too.
function carriedFromResolved(resolved) {
  const out = {}
  for (const [key, value] of Object.entries(resolved)) {
    if (key === 'meta' || key.startsWith('_') || typeof value === 'function') continue
    out[key] = value
  }
  const carried = clone(out)
  if (carried.content?.source && carried.content.data !== undefined) delete carried.content.data
  return carried
}

// The template picker's path, and "Edit in Create" from the play page: a
// variant resolved against its family, annotated by `annotateVariant`.
export function stateFromTemplate(resolved, family, slug) {
  const variantMeta = resolved._variantMeta || {}
  const fileMeta = {}
  for (const [key, value] of Object.entries(resolved._variantFrontmatter || {})) {
    if (!OWNED_META_KEYS.has(key)) fileMeta[key] = value
  }
  return stateFromResolved(resolved, family, {
    title: variantMeta.title || resolved.meta?.label || slug,
    slug,
    win: variantMeta.win || '',
    special: variantMeta.special || '',
    meta: fileMeta,
    surface: resolved._declaredSurface,
  })
}

// Frontmatter keys the metadata block owns, or that are the engine block itself.
const OWNED_META_KEYS = new Set(['engine', 'title', 'slug', 'win', 'special'])

export function resolveImported(parsed) {
  const meta = parsed.meta || {}
  const engine = meta.engine || {}
  const surfaceRef = engine.surface || 'wood-classic'
  const surface = resolveSurface(typeof surfaceRef === 'string' ? surfaceRef : 'wood-classic')

  const family = Object.keys(engine.plugins || {})[0] || meta.parent || 'chess'

  const variantEngine = { ...engine }
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: {}, meta: { label: '' } },
    variant: { engine: variantEngine, meta: { label: meta.title || 'Imported' } },
  })

  const carriedMeta = {}
  for (const [key, value] of Object.entries(meta)) {
    if (!OWNED_META_KEYS.has(key)) carriedMeta[key] = value
  }

  return stateFromResolved(resolved, family, {
    title: meta.title || 'Imported',
    slug: meta.slug || '',
    win: meta.win || '',
    special: meta.special || '',
    meta: carriedMeta,
    source: engine,
  })
}

// The piece definitions a symbol on the board stands for: the variant's own
// vocabulary and plugin pieces, as carried, with any custom piece on top.
export function pieceSpecsFromState(state) {
  const engine = variantEngineFromState(state)
  const family = state.family || 'chess'
  const plugin = engine.plugins?.[family] || {}
  const vocabulary = { ...(engine.vocabulary || {}), ...(plugin.vocabulary || {}) }
  const specs = {}
  for (const [type, def] of Object.entries(vocabulary)) {
    const spec = plugin.pieces?.[type] || plugin.pieceMoves?.[type]
    if (!spec || typeof spec !== 'object') continue
    for (const symbol of Object.values(def?.symbols || {})) specs[symbol] = spec
  }
  return specs
}
