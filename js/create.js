import { renderFromEngine, attachPieceImages, pieceIdToFenChar } from '../packages/render/index.js'
import { parseFrontmatter } from '../packages/schema/index.js'
import { getPlayableFamilies, getFamilyLabel, loadPlayabilityManifest, getPlayableVariants } from './play-shared.js'
import { resolveVariantBoard } from './variant-frontmatter.js'
import { defaultState, buildResolvedFromState, buildSetup, parseSetup, stateFromResolved, resolveImported, isGrid,
  frontmatterFromState, exportText, pieceSpecsFromState, familyOf, extendsOf, inlineExtends, stateFromTemplate, slugify, overrideLook, setGridLayout, setTopologyType, emptyExtra,
  setHexShape, paintCell, restoreAllCells,
  placementKey, setupText, setupFormOf } from './create-state.js'
import { FAMILY_RULES, defaultRuleValues, buildRulesPanel, toPluginConfig } from './create-rules.js'
import { movesForSpec, boardFromPlacement, paintDots, previewTopology, centreCell, cellForKey } from './create-preview.js'
import { defaultPlayers, buildPlayersPanel, resizePlayers, MAX_PLAYERS } from './create-players.js'
import { exportSvgFile, exportPngFile } from './svg-export.js'
import * as drafts from './create-drafts.js'
import { buildExtrasPanel } from './create-extras.js'
import { artUrl, buildArtworkPicker } from './create-artwork.js'
import { getConfigKeys } from '../packages/play/index.js'
import { splitCellId, fileIndex, intersectionIndex } from '../packages/core/index.js'

let galleryIndex = null
let state = defaultState('chess')
let activePiece = null
let activePieceSrc = null
// The cell brush in use: 'void', 'blocker' or 'tint', or null when placing pieces.
let activeBrush = null
let pieceHistory = []
let lastGrid = null
let currentDraftId = null
let autosaveTimer = null
let restoring = false

const STANDARD_PIECE_SPECS = {
  K: { type: 'rider', dirs: 'all', maxSteps: 1 },
  Q: { type: 'rider', dirs: 'all' },
  R: { type: 'rider', dirs: 'orthogonal' },
  B: { type: 'rider', dirs: 'diagonal' },
  N: { type: 'leaper', offsets: 'knight' },
  P: { type: 'leaper', offsets: [[-1, 0]], directional: true },
  p: { type: 'leaper', offsets: [[1, 0]], directional: true },
}

function getSpecForFenChar(fenChar) {
  const upper = fenChar.toUpperCase()
  if (fenChar === 'p') return STANDARD_PIECE_SPECS.p
  if (STANDARD_PIECE_SPECS[upper]) return STANDARD_PIECE_SPECS[upper]
  for (const cp of state.customPieces) {
    if (cp.symbolW === fenChar || cp.symbolB === fenChar) return cp.spec
  }
  return pieceSpecsFromState(state)[fenChar] || null
}


const $ = id => document.getElementById(id)
const val = id => $(id)?.value

// --- state <-> DOM ---

// Each control writes its own field and nothing else. They used to be read
// back all at once on every change, which wrote every control's displayed
// value into the state: a loaded variant's `{ base, colors }` surface became a
// bare name, and every field it left to its family was declared, the moment
// anything at all was touched.
const CONTROL_BINDINGS = {
  'grid-rows': v => { state.topology.rows = parseInt(v, 10) || 8 },
  'grid-cols': v => { state.topology.cols = parseInt(v, 10) || 8 },
  'grid-layout': v => { overrideLook(state); setGridLayout(state, v) },
  'grid-layers': v => {
    const layers = Math.max(1, parseInt(v, 10) || 1)
    state.topology.layers = layers > 1 ? layers : undefined
    for (const key of Object.keys(state.placement)) {
      if (Number(key.split(',')[2] || 0) >= layers) delete state.placement[key]
    }
  },
  'grid-wrap': v => { if (v) state.topology.wrap = v; else delete state.topology.wrap },
  'hex-shape': v => { setHexShape(state, v) },
  'hex-radius': v => { state.topology.radius = parseInt(v, 10) || 5; delete state.topology.grid },
  'hex-rows': v => { state.topology.rows = parseInt(v, 10) || 11; delete state.topology.grid },
  'hex-cols': v => { state.topology.cols = parseInt(v, 10) || 11; delete state.topology.grid },
  'hex-side': v => { state.topology.sideLength = parseInt(v, 10) || 12; delete state.topology.grid },
  'hex-orientation': v => { if (v) state.topology.orientation = v; else delete state.topology.orientation },
  'pit-rows': v => { const rows = parseInt(v, 10) || 2; if (rows === 2 && state.topology.pitRows === undefined) return; state.topology.pitRows = rows },
  'graph-structure': v => { state.topology.structure = v },
  'graph-rings': v => { state.topology.rings = parseInt(v, 10) || 3 },
  'track-positions': v => { state.topology.positions = parseInt(v, 10) || 24 },
  'pit-cols': v => { state.topology.pitCols = parseInt(v, 10) || 6 },
  'surface-select': v => { overrideLook(state); state.render.surface = v },
  'cellcolor-select': v => { overrideLook(state); state.render.cellColor = v },
  'labels-select': v => { state.render.labels = v !== 'false' },
}

const META_BINDINGS = { 'meta-title': 'title', 'meta-slug': 'slug', 'meta-win': 'win', 'meta-special': 'special', 'meta-author': 'author' }

function writeStateIntoControls() {
  restoring = true
  $('meta-title').value = state.title || ''
  $('meta-slug').value = state.slug || ''
  $('meta-win').value = state.win || ''
  $('meta-special').value = state.special || ''
  $('meta-author').value = state.author || ''
  $('family-select').value = state.family
  // A field the variant leaves to its family shows the value it will have.
  const resolved = buildResolvedFromState(state)
  $('topo-type').value = state.topology.type
  $('grid-rows').value = state.topology.rows ?? resolved.topology?.rows ?? 8
  $('grid-cols').value = state.topology.cols ?? resolved.topology?.cols ?? 8
  setSelect('grid-layout', state.topology.layout || 'cells')
  $('grid-layers').value = state.topology.layers || 1
  $('hex-radius').value = state.topology.radius ?? resolved.topology?.radius ?? 5
  setSelect('grid-wrap', state.topology.wrap === undefined || state.topology.wrap === false ? '' : state.topology.wrap)
  setSelect('hex-shape', state.topology.shape === 'hexagonal' ? '' : (state.topology.shape || ''))
  $('hex-rows').value = state.topology.rows ?? 11
  $('hex-cols').value = state.topology.cols ?? 11
  $('hex-side').value = state.topology.sideLength ?? 12
  setSelect('hex-orientation', state.topology.orientation === 'pointy' ? '' : (state.topology.orientation || ''))
  $('pit-rows').value = state.topology.pitRows ?? 2
  $('graph-structure').value = state.topology.structure
  $('graph-rings').value = state.topology.rings
  $('track-positions').value = state.topology.positions
  $('pit-cols').value = state.topology.pitCols
  const surface = state.render.surface
  setSelect('surface-select', typeof surface === 'string' ? surface : surface?.base || resolved.surface?.name || 'wood-classic')
  setSelect('cellcolor-select', state.render.cellColor ?? resolved.render?.cellColor ?? 'checkered')
  $('labels-select').value = (state.render.labels ?? resolved.render?.labels) === false ? 'false' : 'true'
  $('star-points').checked = !!state.render.starPoints
  if ([...$('pieceset-select').options].some(o => o.value === state.pieceSet)) {
    $('pieceset-select').value = state.pieceSet
  }
  lastGrid = { rows: state.topology.rows, cols: state.topology.cols }
  restoring = false
}

// A select shows a value it has no option for by adding one, so a loaded
// variant's own setting is visible rather than shown as the first option.
function setSelect(id, value) {
  const sel = $(id)
  if (!sel) return
  if (value !== undefined && value !== null && ![...sel.options].some(o => o.value === String(value))) {
    const o = document.createElement('option')
    o.value = String(value)
    o.textContent = String(value)
    sel.appendChild(o)
  }
  sel.value = String(value)
}

// --- drafts ---

function scheduleAutosave() {
  if (restoring) return
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    drafts.saveWorking(structuredClone(state))
    if (currentDraftId) drafts.saveDraft(structuredClone(state), { id: currentDraftId })
  }, 400)
}

function renderDraftsPanel() {
  const list = $('drafts-list')
  if (!list) return
  list.innerHTML = ''
  const records = drafts.listDrafts()
  if (!records.length) {
    const empty = document.createElement('div')
    empty.className = 'piece-hint'
    empty.textContent = 'No saved boards yet. Your work in progress is kept automatically; press Save to name it.'
    list.appendChild(empty)
    return
  }
  for (const record of records) {
    const row = document.createElement('div')
    row.className = 'draft-row' + (record.id === currentDraftId ? ' draft-row--active' : '')

    const main = document.createElement('button')
    main.className = 'draft-open'
    main.innerHTML = `<span class="draft-name">${escapeHtml(record.name)}</span>` +
      `<span class="draft-meta">${escapeHtml(drafts.describeDraft(record))} · ${drafts.relativeTime(record.updatedAt)}</span>`
    main.addEventListener('click', () => loadDraft(record.id))
    row.appendChild(main)

    const rename = document.createElement('button')
    rename.className = 'draft-action'
    rename.textContent = 'Rename'
    rename.addEventListener('click', () => {
      const name = prompt('Name this board', record.name)
      if (name && name.trim()) { drafts.renameDraft(record.id, name.trim()); renderDraftsPanel(); syncDraftName() }
    })
    row.appendChild(rename)

    const del = document.createElement('button')
    del.className = 'draft-action draft-action--danger'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      drafts.deleteDraft(record.id)
      if (currentDraftId === record.id) currentDraftId = null
      renderDraftsPanel()
      syncDraftName()
    })
    row.appendChild(del)

    list.appendChild(row)
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function syncDraftName() {
  const input = $('draft-name')
  if (!input) return
  const record = currentDraftId ? drafts.getDraft(currentDraftId) : null
  input.value = record ? record.name : ''
  input.placeholder = record ? '' : 'Unsaved board'
}

function loadDraft(id) {
  const record = drafts.getDraft(id)
  if (!record?.state) return false
  applyState(record.state)
  currentDraftId = id === drafts.WORKING_ID ? null : id
  renderDraftsPanel()
  syncDraftName()
  setStatus(`Restored ${record.name}`)
  return true
}

function applyState(next) {
  state = { ...defaultState(next.family || 'chess'), ...structuredClone(next) }
  state.rules = { ...defaultRuleValues(state.family), ...(next.rules || {}) }
  state.players = next.players ? structuredClone(next.players) : defaultPlayers(state.family)
  pieceHistory = []
  activePiece = null
  activePieceSrc = null
  writeStateIntoControls()
  showTopoOpts()
  buildPiecePicker()
  renderPlayers()
  renderRules()
  renderExtras()
  renderCustomPiecesList()
  render()
  updateInfoText()
  updateTryInPlayState()
}

function saveNamed() {
  const suggested = $('draft-name')?.value?.trim() || drafts.defaultName(state)
  const record = drafts.saveDraft(structuredClone(state), { id: currentDraftId || undefined, name: suggested })
  if (!record) { setStatus('Could not save: browser storage is full or disabled'); return }
  currentDraftId = record.id
  renderDraftsPanel()
  syncDraftName()
  setStatus(`Saved "${record.name}"`)
}

function setStatus(text) {
  const el = $('create-status')
  if (el) el.textContent = text || ''
}

// --- board rendering ---

// A drawn cell's id as the placement map keys it. A grid cell is drawn `a8`,
// or `a8-2` on the second board of a layered one, and its file may run past
// `z`; an intersection board's files skip `i`. Reading the file as one letter
// from `a` put a click on Taikyoku's 27th file on the first.
function sqToPlacementKey(sq) {
  if (!isGrid(state)) return sq
  if (/^\d+,\d+(,\d+)?$/.test(sq)) return sq
  const [, id, layerText] = /^(.*?)(?:-(\d+))?$/.exec(String(sq))
  const cell = splitCellId(id)
  if (!cell) return sq
  const idStyle = buildResolvedFromState(state).render?.idStyle
  const col = idStyle === 'intersection' ? intersectionIndex(cell.file) : fileIndex(cell.file)
  const row = state.topology.rows - cell.rank
  return placementKey(row, col, layerText ? Number(layerText) - 1 : 0)
}

function reanchorPlacement(oldRows, oldCols, rows, cols) {
  if (!oldRows || !oldCols) return 0
  if (oldRows === rows && oldCols === cols) return 0
  const next = {}
  let dropped = 0
  for (const [key, piece] of Object.entries(state.placement)) {
    const [r, c, layer] = key.split(',').map(Number)
    const fromBottom = oldRows - 1 - r
    const nr = rows - 1 - fromBottom
    if (nr < 0 || nr >= rows || c >= cols) { dropped++; continue }
    next[placementKey(nr, c, layer || 0)] = piece
  }
  state.placement = next
  return dropped
}

async function loadGallery() {
  try { galleryIndex = await fetch('../pieces/gallery-index.json?v=1.0.41').then(r => r.json()) }
  catch { galleryIndex = [] }
}

function render() {
  const resolved = buildResolvedFromState(state)
  const container = $('board-svg')

  const opts = {}
  if (resolved.pieces?.set && galleryIndex) {
    const result = attachPieceImages(resolved, galleryIndex)
    opts.pieceImages = result.images || {}
    opts.pieceSurfaceMap = result.surfaceMap || {}
    opts.pieceSurface = result.surface || null
  }

  const svg = renderFromEngine(resolved, opts)
  container.classList.add('active')
  if (svg) {
    container.innerHTML = svg
    updateCursors()
  } else {
    container.innerHTML = '<div class="canvas-error">Cannot render this configuration</div>'
  }
  scheduleAutosave()
}

function clearHoverHighlights() {
  $('board-svg').querySelectorAll('.piece-ghost, .hover-move-dot').forEach(el => el.remove())
}

// The board's own topology, as a game would build it, for the previews.
function currentTopology() {
  const resolved = buildResolvedFromState(state)
  return { topology: previewTopology(resolved.topology), idStyle: resolved.render?.idStyle }
}

function showHoverMoves(key) {
  const fenChar = state.placement[key]
  if (!fenChar) return
  const spec = getSpecForFenChar(fenChar)
  if (!spec) return
  const { topology, idStyle } = currentTopology()
  if (!topology) return
  const moverIsUpper = fenChar === fenChar.toUpperCase()
  const board = boardFromPlacement(topology, state.placement, moverIsUpper)
  const moves = movesForSpec(spec, { topology, from: cellForKey(topology, key), board })
  if (!moves) return
  paintDots($('board-svg'), moves, {
    topology, idStyle,
    className: 'hover-move-dot',
    fill: m => (m.capture ? 'rgba(244, 67, 54, 0.5)' : 'rgba(76, 175, 80, 0.5)'),
  })
}

// One delegated listener set on the container, bound once at init.
//
// The previous version attached listeners per cell and re-attached them every
// time a palette button was pressed, without the cells having been re-rendered
// in between. The cell then carried two identical handlers, and a click ran
// both: the first placed the piece, the second saw the piece already there and
// removed it again. The visible symptom was that the first click after picking
// a piece silently did nothing, every single time.
function bindBoard() {
  const container = $('board-svg')

  const keyFor = target => {
    const cell = target.closest ? target.closest('.board-cell') : null
    const sq = cell?.dataset?.sq
    return sq ? { cell, key: sqToPlacementKey(sq) } : null
  }

  container.addEventListener('click', (e) => {
    const hit = keyFor(e.target)
    if (hit && activeBrush) {
      const brush = activeBrush === 'tint' ? { fill: val('brush-tint-color') || '#6b8fb8', opacity: 0.5 } : activeBrush
      pieceHistory.push({ cells: structuredClone({ topology: state.topology, tints: state.render.tints, placement: state.placement }) })
      if (paintCell(state, hit.key, brush)) { render(); updateInfoText() }
      return
    }
    if (!hit || !activePiece) return
    pieceHistory.push({ sq: hit.key, prev: state.placement[hit.key] || null })
    if (activePiece === '__erase' || state.placement[hit.key] === activePiece) delete state.placement[hit.key]
    else state.placement[hit.key] = activePiece
    render()
    updateInfoText()
  })

  container.addEventListener('contextmenu', (e) => {
    const hit = keyFor(e.target)
    if (!hit) return
    e.preventDefault()
    if (!state.placement[hit.key]) return
    pieceHistory.push({ sq: hit.key, prev: state.placement[hit.key] })
    delete state.placement[hit.key]
    render()
    updateInfoText()
  })

  container.addEventListener('mouseover', (e) => {
    const hit = keyFor(e.target)
    if (!hit) return
    clearHoverHighlights()
    if (activePiece && activePiece !== '__erase' && activePieceSrc && hit.cell.getBBox) {
      const rect = hit.cell.getBBox()
      const svgEl = container.querySelector('svg')
      if (!svgEl) return
      const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'image')
      ghost.setAttribute('href', activePieceSrc)
      ghost.setAttribute('x', rect.x + rect.width * 0.1)
      ghost.setAttribute('y', rect.y + rect.height * 0.1)
      ghost.setAttribute('width', rect.width * 0.8)
      ghost.setAttribute('height', rect.height * 0.8)
      ghost.setAttribute('opacity', '0.4')
      ghost.setAttribute('pointer-events', 'none')
      ghost.setAttribute('class', 'piece-ghost')
      svgEl.appendChild(ghost)
    }
    if (!activePiece && state.placement[hit.key]) showHoverMoves(hit.key)
  })

  container.addEventListener('mouseout', (e) => {
    if (keyFor(e.target)) clearHoverHighlights()
  })
}

// Cursors are the only per-cell state left, and they are re-applied after each
// render rather than carried on a listener.
function updateCursors() {
  const container = $('board-svg')
  container.querySelectorAll('.board-cell').forEach(cell => {
    const sq = cell.dataset.sq
    if (!sq) return
    if (activeBrush) cell.style.cursor = 'crosshair'
    else if (activePiece === '__erase') cell.style.cursor = state.placement[sqToPlacementKey(sq)] ? 'pointer' : 'default'
    else if (activePiece) cell.style.cursor = 'copy'
    else cell.style.cursor = 'default'
  })
}

// --- setup bar ---

function syncSetupInput() {
  const input = $('setup-input')
  if (!input || document.activeElement === input) return
  input.classList.remove('is-invalid')
  input.value = setupText(Object.keys(state.placement).length ? buildSetup(state) : state.rawSetup)
}

// A setup the board can place is read onto it. One it cannot - a pit board's
// seed counts - is kept as written, where the board has no cells to place on.
function applySetupInput(text) {
  const input = $('setup-input')
  const next = parseSetup(text, {
    type: state.topology.type,
    rows: state.topology.rows,
    cols: state.topology.cols,
    layers: state.topology.layers,
    topology: { ...(state.extra?.topology || {}), ...state.topology },
  })
  if (next === null && isGrid(state)) { input.classList.add('is-invalid'); return false }
  pieceHistory.push({ replaceAll: { ...state.placement } })
  if (next === null) {
    state.placement = {}
    state.rawSetup = text.trim()
  } else {
    state.placement = next
    delete state.rawSetup
    state.setupForm = { ...setupFormOf(text.includes('|') ? text.split('|').map(t => t.trim()) : text), array: (state.topology.layers || 1) > 1 }
  }
  input.classList.remove('is-invalid')
  render()
  updateInfoText()
  return true
}

function updateInfoText() {
  const count = Object.keys(state.placement).length
  const el = $('info-text')
  const prefix = count > 0 ? `${count} piece${count !== 1 ? 's' : ''} placed · ` : ''
  if (activeBrush) {
    el.textContent = prefix + `Painting cells: ${activeBrush}. Click a cell again to clear it.`
  } else if (activePiece && activePiece !== '__erase') {
    const imgTag = activePieceSrc ? `<img class="info-piece" src="${activePieceSrc}" width="18" height="18">` : ''
    el.innerHTML = prefix + `Placing: ${imgTag}<span class="info-strong">${escapeHtml(activePiece)}</span>`
  } else if (activePiece === '__erase') {
    el.textContent = prefix + 'Eraser active'
  } else {
    el.textContent = count > 0 ? `${count} piece${count !== 1 ? 's' : ''} placed` : 'Configure board and click cells to place pieces'
  }
  syncSetupInput()
  scheduleAutosave()
}

// --- piece palette ---

function populatePieceSets() {
  const select = $('pieceset-select')
  if (!galleryIndex || !galleryIndex.length) return
  const placeable = galleryIndex.filter(s => paletteEntries(s).length > 0)
  const families = [...new Set(placeable.map(s => s.family))].sort()
  for (const fam of families) {
    const group = document.createElement('optgroup')
    group.label = fam.replace(/-/g, ' ')
    for (const s of placeable.filter(s => s.family === fam)) {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.name || s.id
      group.appendChild(opt)
    }
    select.appendChild(group)
  }
}

function paletteEntries(setDef) {
  const out = []
  for (const [pieceId, entry] of Object.entries(setDef.pieces || {})) {
    const fenChar = pieceIdToFenChar(pieceId)
    if (!fenChar) continue
    const file = typeof entry === 'string' ? entry : entry?.file
    const dir = (typeof entry === 'object' && entry?.source) || setDef.baseSet || setDef.id
    out.push({
      pieceId,
      fenChar,
      src: file ? `../pieces/sets/${dir}/${file}` : null,
      side: fenChar === fenChar.toUpperCase() ? 'first' : 'second',
    })
  }
  return out
}

function selectBrush(brush) {
  activeBrush = activeBrush === brush ? null : brush
  activePiece = null
  activePieceSrc = null
  for (const btn of document.querySelectorAll('.brush-btn')) btn.classList.toggle('active', btn.dataset.brush === activeBrush)
  buildPiecePicker()
  updateInfoText()
  updateCursors()
}

function selectPiece(sym, src) {
  activeBrush = null
  for (const btn of document.querySelectorAll('.brush-btn')) btn.classList.remove('active')
  activePiece = activePiece === sym ? null : sym
  activePieceSrc = activePiece ? (src || null) : null
  buildPiecePicker()
  updateInfoText()
  updateCursors()
}

function buildPiecePicker() {
  const setId = state.pieceSet
  const picker = $('piece-picker')
  picker.innerHTML = ''
  const setDef = setId ? galleryIndex?.find(s => s.id === setId) : null
  const entries = setDef?.pieces ? paletteEntries(setDef) : []

  // A piece defined below carries its own symbols and artwork, so it can be
  // placed whether or not a set is chosen; the hint only covers the case where
  // there is nothing at all to place.
  if (!entries.length && !state.customPieces.length) {
    activePiece = null
    picker.innerHTML = setId
      ? '<div class="piece-hint">This set names its pieces by what they show, not by board symbols. Define a piece below and choose its artwork from this set.</div>'
      : '<div class="piece-hint">Choose a piece set above, or define a piece below, to start placing pieces.</div>'
    $('active-piece-label').textContent = ''
    return
  }

  for (const side of ['first', 'second']) {
    const group = entries.filter(e => e.side === side)
    if (!group.length) continue
    const heading = document.createElement('div')
    heading.className = 'piece-group-label'
    heading.textContent = side === 'first' ? 'First player' : 'Second player'
    picker.appendChild(heading)

    const row = document.createElement('div')
    row.className = 'piece-group'
    for (const e of group) {
      const btn = document.createElement('button')
      btn.className = 'piece-btn' + (activePiece === e.fenChar ? ' active' : '')
      btn.title = `${e.pieceId} (${e.fenChar})`
      if (e.src) {
        const img = document.createElement('img')
        img.src = e.src
        img.alt = e.pieceId
        img.width = 36
        img.height = 36
        btn.appendChild(img)
      } else {
        btn.textContent = e.fenChar
      }
      btn.addEventListener('click', () => selectPiece(e.fenChar, e.src))
      row.appendChild(btn)
    }
    picker.appendChild(row)
  }

  if (state.customPieces.length) {
    const heading = document.createElement('div')
    heading.className = 'piece-group-label'
    heading.textContent = 'Custom'
    picker.appendChild(heading)
    const row = document.createElement('div')
    row.className = 'piece-group'
    for (const cp of state.customPieces) {
      for (const [sym, label, ref] of [[cp.symbolW, cp.name + ' (W)', cp.artW], [cp.symbolB, cp.name + ' (b)', cp.artB]]) {
        const btn = document.createElement('button')
        btn.className = 'piece-btn' + (activePiece === sym ? ' active' : '')
        btn.title = label
        const url = artUrl(galleryIndex, ref)
        if (url) {
          const img = document.createElement('img')
          img.src = url
          img.alt = label
          img.width = 36
          img.height = 36
          btn.appendChild(img)
        } else {
          btn.textContent = sym
        }
        btn.addEventListener('click', () => selectPiece(sym, url))
        row.appendChild(btn)
      }
    }
    picker.appendChild(row)
  }

  const eraser = document.createElement('button')
  eraser.className = 'piece-btn piece-btn--eraser' + (activePiece === '__erase' ? ' active' : '')
  eraser.title = 'Eraser: click a cell to clear it'
  eraser.textContent = 'Erase'
  eraser.addEventListener('click', () => selectPiece('__erase', null))
  picker.appendChild(eraser)

  $('active-piece-label').textContent =
    activePiece === '__erase' ? '(eraser)' : activePiece ? `(${activePiece})` : ''
}

// --- piece definer ---

// The artwork chosen in the piece form, per side, before the piece is saved.
let pieceArtDraft = { artW: null, artB: null }
let pickingArtFor = null

function buildPieceSpec() {
  // Betza, where given, says the whole movement.
  const betza = val('def-betza')?.trim()
  if (betza) return { betza }
  const shape = val('def-shape')
  const dirs = val('def-dirs')
  const maxSteps = parseInt(val('def-maxsteps'), 10) || undefined
  const directional = $('def-directional').checked
  const lame = $('def-lame').checked

  const spec = { type: shape }
  if (shape === 'rider') {
    spec.dirs = dirs
    if (maxSteps) spec.maxSteps = maxSteps
  } else if (shape === 'leaper') {
    spec.offsets = dirs
    if (lame) spec.lame = (dirs === 'elephant') ? 'half' : 'orthogonal'
  } else if (shape === 'hopper') {
    spec.dirs = dirs
    spec.captureSlide = true
  }
  if (directional) spec.directional = true
  return spec
}

function previewMoves() {
  const { topology, idStyle } = currentTopology()
  if (!topology) { setStatus('This board has no geometry to preview on'); return }
  const from = centreCell(topology)
  const board = boardFromPlacement(topology, {}, true)
  board[from] = { friendly: true, owner: 0, type: 'preview' }
  const moves = movesForSpec(buildPieceSpec(), { topology, from, board })
  const container = $('board-svg')
  container.querySelectorAll('.move-preview-dot').forEach(el => el.remove())
  if (!moves) { setStatus('That movement does not build'); return }
  paintDots(container, moves, { topology, idStyle, className: 'move-preview-dot', fill: 'rgba(76, 175, 80, 0.6)', radiusFactor: 0.2 })
  paintDots(container, [from], { topology, idStyle, className: 'move-preview-dot', fill: 'rgba(33, 150, 243, 0.6)', radiusFactor: 0.25 })
  setStatus(`${moves.length} reachable cell${moves.length === 1 ? '' : 's'} from the centre`)
}

// Saving a piece under a name it already has replaces it: that is how a piece
// is edited.
function addCustomPiece() {
  const name = val('def-name').trim()
  const symbolW = val('def-symbol-w').trim()
  const symbolB = val('def-symbol-b').trim()
  if (!name || !symbolW || !symbolB) { setStatus('A piece needs a name and a symbol for each side'); return }
  if (symbolW === symbolB) { setStatus('The two sides need different symbols'); return }
  const spec = buildPieceSpec()
  if (!movesForSpec(spec, { topology: previewTopology({ type: 'grid', rows: 8, cols: 8 }), from: 27, board: new Array(64).fill(null) })) {
    setStatus('That movement does not build. Check the Betza notation.')
    return
  }
  const piece = { name, symbolW, symbolB, spec }
  if (pieceArtDraft.artW) piece.artW = pieceArtDraft.artW
  if (pieceArtDraft.artB) piece.artB = pieceArtDraft.artB
  const at = state.customPieces.findIndex(p => p.name === name)
  if (at >= 0) state.customPieces[at] = piece
  else state.customPieces.push(piece)
  renderCustomPiecesList()
  buildPiecePicker()
  render()
  setStatus(`${name} saved: place it as ${symbolW} or ${symbolB}`)
}

// A saved piece back in the form, to change and save again.
function editCustomPiece(piece) {
  $('def-name').value = piece.name
  $('def-symbol-w').value = piece.symbolW
  $('def-symbol-b').value = piece.symbolB
  $('def-betza').value = piece.spec?.betza || ''
  if (!piece.spec?.betza && piece.spec) {
    if (piece.spec.type) $('def-shape').value = piece.spec.type
    const dirs = piece.spec.dirs || piece.spec.offsets
    if (typeof dirs === 'string') $('def-dirs').value = dirs
    $('def-maxsteps').value = piece.spec.maxSteps || ''
    $('def-directional').checked = !!piece.spec.directional
    $('def-lame').checked = !!piece.spec.lame
  }
  pieceArtDraft = { artW: piece.artW || null, artB: piece.artB || null }
  showArtDraft()
}

function showArtDraft() {
  for (const [side, id, label] of [['artW', 'def-art-w', 'W'], ['artB', 'def-art-b', 'b']]) {
    const btn = $(id)
    if (!btn) continue
    const url = artUrl(galleryIndex, pieceArtDraft[side])
    btn.innerHTML = ''
    if (url) {
      const img = document.createElement('img')
      img.src = url
      img.alt = pieceArtDraft[side]
      btn.appendChild(img)
    } else {
      btn.textContent = label
    }
    btn.classList.toggle('active', pickingArtFor === side)
  }
}

function openArtPicker(side) {
  const picker = $('artwork-picker')
  if (pickingArtFor === side) { pickingArtFor = null; picker.hidden = true; showArtDraft(); return }
  pickingArtFor = side
  picker.hidden = false
  const current = pieceArtDraft[side] || pieceArtDraft.artW || pieceArtDraft.artB
  buildArtworkPicker(picker, galleryIndex, (ref) => {
    pieceArtDraft[side] = ref
    // One image for both sides is the usual start; the second side can differ.
    if (side === 'artW' && !pieceArtDraft.artB) pieceArtDraft.artB = ref
    showArtDraft()
  }, { initialSet: current ? current.split('/')[0] : state.pieceSet || undefined })
  showArtDraft()
}

function renderCustomPiecesList() {
  const list = $('custom-pieces-list')
  if (!list) return
  list.innerHTML = ''
  state.customPieces.forEach((p, i) => {
    const row = document.createElement('div')
    row.className = 'custom-piece-row'
    const name = document.createElement('button')
    name.className = 'custom-piece-name'
    name.textContent = `${p.name} (${p.symbolW}/${p.symbolB})`
    name.title = 'Edit this piece'
    name.addEventListener('click', () => editCustomPiece(p))
    row.appendChild(name)
    const del = document.createElement('button')
    del.className = 'draft-action draft-action--danger'
    del.textContent = 'x'
    del.addEventListener('click', () => {
      state.customPieces.splice(i, 1)
      renderCustomPiecesList()
      buildPiecePicker()
      scheduleAutosave()
    })
    row.appendChild(del)
    list.appendChild(row)
  })
}

// --- rules ---

function renderPlayers() {
  const panel = $('players-panel')
  if (!panel) return
  buildPlayersPanel(panel, state.family, state.players, (field, value, index) => {
    if (field === 'count') {
      const max = MAX_PLAYERS[state.family] || 2
      state.players = resizePlayers(state.players, Math.min(value, max), state.family)
      renderPlayers()
    } else if (field === 'name') {
      state.players.names[index] = value
    } else if (field === 'direction') {
      state.players.advancement[index] = value
      if (state.players.declared) state.players.declared.advancement = true
    }
    render()
    updateInfoText()
  })
}

function renderRules() {
  const panel = $('rules-panel')
  if (!panel) return
  const heading = $('rules-heading')
  if (heading) heading.textContent = `${getFamilyLabel(state.family)} rules`
  buildRulesPanel(panel, state.family, state.rules, (key, value) => {
    state.rules[key] = value
    // Set by hand, so written whatever its value.
    state.rulesDeclared = [...new Set([...(state.rulesDeclared || []), key])]
    render()
    updateInfoText()
  })
}

// --- other settings ---

function renderExtras() {
  const panel = $('extras-panel')
  if (!panel) return
  buildExtrasPanel(panel, {
    extra: state.extra,
    family: state.family,
    familyLabel: getFamilyLabel(state.family),
    configKeys: getConfigKeys(state.family),
    controlledKeys: [...(FAMILY_RULES[state.family] || []).map(f => f.key), 'playerCount', 'advancement'],
  }, (block, key, value) => {
    state.extra = state.extra || emptyExtra()
    state.extra[block] = { ...(state.extra[block] || {}) }
    if (value === undefined) delete state.extra[block][key]
    else state.extra[block][key] = value
    renderExtras()
    render()
    updateInfoText()
  })
}

// --- templates ---

// The families a board can be built for: every one the manifest calls playable.
// This was a six-name literal, the fault the play page's picker had until it
// read the manifest too, and a hex or mancala template loaded into a select
// that could not show its family.
function populateFamilies() {
  const sel = $('family-select')
  if (!sel) return
  sel.innerHTML = ''
  for (const f of getPlayableFamilies()) {
    const o = document.createElement('option')
    o.value = f
    o.textContent = getFamilyLabel(f)
    sel.appendChild(o)
  }
}

function populateTemplateFamilies() {
  const sel = $('template-family')
  if (!sel) return
  for (const f of getPlayableFamilies()) {
    const o = document.createElement('option')
    o.value = f
    o.textContent = getFamilyLabel(f)
    sel.appendChild(o)
  }
  sel.value = 'chess'
  populateTemplateVariants()
}

function populateTemplateVariants() {
  const sel = $('template-variant')
  if (!sel) return
  sel.innerHTML = ''
  const entries = getPlayableVariants(val('template-family') || 'chess')
  for (const e of entries) {
    const o = document.createElement('option')
    o.value = e.slug || e.variant
    o.textContent = e.label || e.variant
    sel.appendChild(o)
  }
  if (!entries.length) {
    const o = document.createElement('option')
    o.value = ''
    o.textContent = 'No playable variants'
    sel.appendChild(o)
  }
}

async function loadTemplate() {
  const templateFamily = val('template-family') || 'chess'
  const slug = val('template-variant')
  if (!slug) return
  const btn = $('template-load-btn')
  btn.disabled = true
  setStatus(`Loading ${slug}…`)
  try {
    const resolved = await resolveVariantBoard(templateFamily, {}, slug, slug)
    const next = stateFromTemplate(resolved, templateFamily, slug)
    applyState(next)
    currentDraftId = null
    syncDraftName()
    setStatus(`Loaded ${next.title} as a starting point. Save it to keep your changes separate.`)
  } catch (e) {
    setStatus(`Could not load ${slug}: ${e.message}`)
  } finally {
    btn.disabled = false
  }
}

// --- export ---

async function importYaml(text) {
  try {
    let parsed = parseFrontmatter(text)
    if (!parsed?.meta?.engine) {
      setStatus('No engine block found in the imported file')
      return false
    }
    // A file that extends another variant is completed from it, so what is
    // loaded - and exported - stands on its own.
    const parent = extendsOf(parsed)
    if (parent) {
      const family = familyOf(parsed)
      const resolved = await resolveVariantBoard(family, {}, parent, parent)
      parsed = inlineExtends(parsed, resolved.plugins?.[family])
    }
    const next = resolveImported(parsed)
    applyState(next)
    currentDraftId = null
    syncDraftName()
    setStatus(`Imported "${next.title}"`)
    return true
  } catch (e) {
    setStatus(`Import failed: ${e.message}`)
    return false
  }
}

function exportYaml() {
  const yaml = exportText(state)

  const blob = new Blob([yaml], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(state.title)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// --- topology visibility ---

function showTopoOpts() {
  const type = state.topology.type
  $('grid-opts').hidden = type !== 'grid'
  $('hex-opts').hidden = type !== 'hex'
  $('graph-opts').hidden = type !== 'graph'
  $('track-opts').hidden = type !== 'track'
  $('pit-opts').hidden = type !== 'pit'
  const shape = state.topology.shape
  $('hex-radius').hidden = shape === 'rhombus' || shape === 'triangular'
  $('hex-rhombus-size').hidden = shape !== 'rhombus'
  $('hex-side').hidden = shape !== 'triangular'
  $('hex-size-label').textContent = shape === 'rhombus' ? 'Rows × Cols' : shape === 'triangular' ? 'Side' : 'Radius'
  $('cell-brush').hidden = type !== 'grid' && type !== 'hex'
  for (const btn of document.querySelectorAll('.brush-btn')) btn.hidden = type === 'hex' && btn.dataset.brush !== 'void'
  $('brush-tint-color').hidden = type === 'hex'
  const intersections = type === 'grid' && state.topology.layout === 'intersections'
  $('cellcolor-group').hidden = type !== 'grid' || intersections
  $('starpoints-group').hidden = !intersections
}

function undo() {
  const last = pieceHistory.pop()
  if (!last) return
  if (last.cells) {
    state.topology = last.cells.topology
    state.placement = last.cells.placement
    if (last.cells.tints) state.render.tints = last.cells.tints
    else delete state.render.tints
  } else if (last.replaceAll) state.placement = last.replaceAll
  else if (last.prev) state.placement[last.sq] = last.prev
  else delete state.placement[last.sq]
  render()
  updateInfoText()
}

// Every topology is playable (engine#62), so every draft can be tried. What a
// draft needs is a family that plays it.
function updateTryInPlayState() {
  const btn = $('try-play-btn')
  if (!btn) return
  const playable = getPlayableFamilies().includes(state.family)
  btn.disabled = !playable
  btn.title = playable ? 'Play this board as it stands' : `No ${getFamilyLabel(state.family)} variant is playable yet`
}

function tryInPlay() {
  if ($('try-play-btn')?.disabled) return
  clearTimeout(autosaveTimer)
  const snapshot = structuredClone(state)
  const name = $('draft-name')?.value?.trim() || drafts.defaultName(snapshot)
  const record = currentDraftId
    ? drafts.saveDraft(snapshot, { id: currentDraftId, name })
    : drafts.saveWorking(snapshot)
  const id = record ? record.id : drafts.WORKING_ID
  const params = new URLSearchParams({ family: state.family, variant: 'draft', draft: id })
  window.location.href = '../play/?' + params.toString()
}

// --- init ---

function onControlChange() {
  showTopoOpts()
  render()
  updateInfoText()
  updateTryInPlayState()
}

async function init() {
  await Promise.all([loadGallery(), loadPlayabilityManifest()])
  bindBoard()
  populatePieceSets()
  populateFamilies()
  populateTemplateFamilies()

  const params = new URLSearchParams(location.search)
  const requested = drafts.resolveDraftId(params.get('draft'))
  let restored = false
  if (requested) {
    restored = loadDraft(requested)
  } else if (params.get('variant')) {
    // The other direction of the round-trip: a variant played on the play page
    // opens here as a starting point. Same path as the template picker.
    $('template-family').value = params.get('family') || 'chess'
    populateTemplateVariants()
    $('template-variant').value = params.get('variant')
    await loadTemplate()
    restored = true
  } else {
    const working = drafts.getWorkingDraft()
    if (working && drafts.hasContent(working.state, defaultState)) {
      applyState(working.state)
      restored = true
      setStatus('Restored your last board. Use Start new to clear it.')
    }
  }
  if (!restored) {
    writeStateIntoControls()
    showTopoOpts()
    buildPiecePicker()
    renderPlayers()
    renderRules()
    renderExtras()
    render()
    updateInfoText()
    updateTryInPlayState()
  }
  renderDraftsPanel()
  syncDraftName()

  $('family-select').addEventListener('change', () => {
    state.family = val('family-select')
    state.rules = defaultRuleValues(state.family)
    state.rulesDeclared = []
    state.players = defaultPlayers(state.family)
    // Another family's plugin reads none of this one's settings.
    state.extra = { ...state.extra, plugin: {} }
    renderPlayers()
    renderRules()
    renderExtras()
    onControlChange()
  })

  $('topo-type').addEventListener('change', () => {
    pieceHistory = []
    const type = val('topo-type')
    setTopologyType(state, type)
    if (type === 'pit') state.render.surface = 'earth'
    else if (type === 'graph') state.render.surface = 'parchment'
    else state.render.surface = 'wood-classic'
    writeStateIntoControls()
    renderExtras()
    onControlChange()
  })

  for (const [id, apply] of Object.entries(CONTROL_BINDINGS)) {
    $(id)?.addEventListener('change', () => {
      apply(val(id))
      renderExtras()
      onControlChange()
    })
  }
  $('star-points')?.addEventListener('change', () => {
    state.render.starPoints = !!$('star-points').checked
    onControlChange()
  })

  // Resizing keeps each piece at the same distance from the first player's edge.
  for (const id of ['grid-rows', 'grid-cols']) {
    $(id)?.addEventListener('change', () => {
      const rows = state.topology.rows
      const cols = state.topology.cols
      const dropped = lastGrid ? reanchorPlacement(lastGrid.rows, lastGrid.cols, rows, cols) : 0
      lastGrid = { rows, cols }
      render()
      updateInfoText()
      if (dropped) setStatus(`${dropped} piece${dropped !== 1 ? 's' : ''} did not fit the new board and ${dropped !== 1 ? 'were' : 'was'} removed`)
    })
  }

  $('pieceset-select').addEventListener('change', () => {
    state.pieceSet = val('pieceset-select')
    buildPiecePicker()
    render()
  })

  for (const [id, field] of Object.entries(META_BINDINGS)) {
    $(id)?.addEventListener('input', () => {
      state[field] = val(id) || (field === 'title' ? 'Custom Variant' : '')
      if (id === 'meta-title' && !$('meta-slug').value) {
        $('meta-slug').placeholder = slugify(state.title) || 'slug (auto from title)'
      }
      scheduleAutosave()
    })
  }

  $('template-family').addEventListener('change', populateTemplateVariants)
  $('template-load-btn').addEventListener('click', loadTemplate)

  $('draft-save-btn').addEventListener('click', saveNamed)
  $('draft-new-btn').addEventListener('click', () => {
    applyState(defaultState(state.family))
    currentDraftId = null
    drafts.saveWorking(structuredClone(state))
    renderDraftsPanel()
    syncDraftName()
    setStatus('Started a new board')
  })

  $('import-yaml-btn').addEventListener('click', () => $('import-yaml-file').click())
  $('import-yaml-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then(text => importYaml(text))
    e.target.value = ''
  })

  $('export-yaml-btn').addEventListener('click', exportYaml)
  $('export-svg-btn').addEventListener('click', async () => {
    const ok = await exportSvgFile($('board-svg').querySelector('svg'), `${slugify(state.title)}.svg`)
    setStatus(ok ? 'SVG exported with pieces embedded' : 'Nothing to export')
  })
  $('export-png-btn').addEventListener('click', async () => {
    const ok = await exportPngFile($('board-svg').querySelector('svg'), `${slugify(state.title)}.png`)
    setStatus(ok ? 'PNG exported' : 'Nothing to export')
  })

  $('bar-undo-btn').addEventListener('click', undo)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
  })

  $('def-preview-btn')?.addEventListener('click', previewMoves)
  $('def-add-btn')?.addEventListener('click', addCustomPiece)
  $('def-art-w')?.addEventListener('click', () => openArtPicker('artW'))
  $('def-art-b')?.addEventListener('click', () => openArtPicker('artB'))
  $('def-art-clear')?.addEventListener('click', () => {
    pieceArtDraft = { artW: null, artB: null }
    pickingArtFor = null
    $('artwork-picker').hidden = true
    showArtDraft()
  })

  const setupInput = $('setup-input')
  setupInput?.addEventListener('change', () => applySetupInput(setupInput.value))
  setupInput?.addEventListener('blur', syncSetupInput)

  $('setup-copy-btn')?.addEventListener('click', () => {
    const value = setupText(Object.keys(state.placement).length ? buildSetup(state) : state.rawSetup)
    if (value && navigator.clipboard) navigator.clipboard.writeText(value)
  })

  $('try-play-btn')?.addEventListener('click', tryInPlay)
  for (const btn of document.querySelectorAll('.brush-btn')) {
    btn.addEventListener('click', () => selectBrush(btn.dataset.brush))
  }
  $('restore-cells-btn')?.addEventListener('click', () => {
    pieceHistory.push({ cells: structuredClone({ topology: state.topology, tints: state.render.tints, placement: state.placement }) })
    restoreAllCells(state)
    render()
    updateInfoText()
  })
  $('clear-pieces-btn').addEventListener('click', () => {
    state.placement = {}
    pieceHistory = []
    render()
    updateInfoText()
  })

  $('draft-name')?.addEventListener('change', () => {
    if (currentDraftId) { drafts.renameDraft(currentDraftId, $('draft-name').value.trim()); renderDraftsPanel() }
  })
}

init()
