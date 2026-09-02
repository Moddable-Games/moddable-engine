import { renderFromEngine, attachPieceImages, pieceIdToFenChar } from '../packages/render/index.js'
import { parseFrontmatter, serializeFrontmatter } from '../packages/schema/index.js'
import { getPlayableFamilies, getFamilyLabel, loadPlayabilityManifest, getPlayableVariants } from './play-shared.js'
import { resolveVariantBoard } from './variant-frontmatter.js'
import { defaultState, buildResolvedFromState, buildSetup, parseSetup, stateFromResolved, resolveImported, isGrid } from './create-state.js'
import { FAMILY_RULES, defaultRuleValues, buildRulesPanel, toPluginConfig } from './create-rules.js'
import { movesForSpec, boardFromPlacement, paintDots } from './create-preview.js'
import { defaultPlayers, buildPlayersPanel, resizePlayers, MAX_PLAYERS } from './create-players.js'
import { exportSvgFile, exportPngFile } from './svg-export.js'
import * as drafts from './create-drafts.js'

let galleryIndex = null
let state = defaultState('chess')
let activePiece = null
let activePieceSrc = null
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
  for (const [type, def] of Object.entries(state.inheritedVocabulary || {})) {
    if (!Object.values(def?.symbols || {}).includes(fenChar)) continue
    const carried = state.inheritedPieces || {}
    return carried.pieces?.[type] || carried.pieceMoves?.[type] || null
  }
  return null
}

const $ = id => document.getElementById(id)
const val = id => $(id)?.value
const num = (id, fallback) => parseInt($(id)?.value, 10) || fallback

// --- state <-> DOM ---

function readControlsIntoState() {
  state.family = val('family-select') || 'chess'
  state.title = val('meta-title') || 'Custom Variant'
  state.slug = val('meta-slug') || ''
  state.win = val('meta-win') || ''
  state.special = val('meta-special') || ''
  state.topology.type = val('topo-type') || 'grid'
  state.topology.rows = num('grid-rows', 8)
  state.topology.cols = num('grid-cols', 8)
  state.topology.layout = val('grid-layout') || 'cells'
  state.topology.radius = num('hex-radius', 5)
  state.topology.structure = val('graph-structure') || 'concentric-rings'
  state.topology.rings = num('graph-rings', 3)
  state.topology.positions = num('track-positions', 24)
  state.topology.pitCols = num('pit-cols', 6)
  state.render.surface = val('surface-select') || 'wood-classic'
  state.render.cellColor = val('cellcolor-select') || 'checkered'
  state.render.labels = val('labels-select') !== 'false'
  state.render.starPoints = !!$('star-points')?.checked
  state.pieceSet = val('pieceset-select') || ''
}

function writeStateIntoControls() {
  restoring = true
  $('meta-title').value = state.title || ''
  $('meta-slug').value = state.slug || ''
  $('meta-win').value = state.win || ''
  $('meta-special').value = state.special || ''
  $('family-select').value = state.family
  $('topo-type').value = state.topology.type
  $('grid-rows').value = state.topology.rows
  $('grid-cols').value = state.topology.cols
  $('grid-layout').value = state.topology.layout || 'cells'
  $('hex-radius').value = state.topology.radius
  $('graph-structure').value = state.topology.structure
  $('graph-rings').value = state.topology.rings
  $('track-positions').value = state.topology.positions
  $('pit-cols').value = state.topology.pitCols
  $('surface-select').value = state.render.surface
  $('cellcolor-select').value = state.render.cellColor
  $('labels-select').value = state.render.labels ? 'true' : 'false'
  $('star-points').checked = !!state.render.starPoints
  if ([...$('pieceset-select').options].some(o => o.value === state.pieceSet)) {
    $('pieceset-select').value = state.pieceSet
  }
  lastGrid = { rows: state.topology.rows, cols: state.topology.cols }
  restoring = false
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

function sqToPlacementKey(sq) {
  if (!isGrid(state)) return sq
  if (/^\d+,\d+$/.test(sq)) return sq
  const col = sq.charCodeAt(0) - 97
  const row = state.topology.rows - parseInt(sq.slice(1), 10)
  return `${row},${col}`
}

function reanchorPlacement(oldRows, oldCols, rows, cols) {
  if (!oldRows || !oldCols) return 0
  if (oldRows === rows && oldCols === cols) return 0
  const next = {}
  let dropped = 0
  for (const [key, piece] of Object.entries(state.placement)) {
    const [r, c] = key.split(',').map(Number)
    const fromBottom = oldRows - 1 - r
    const nr = rows - 1 - fromBottom
    if (nr < 0 || nr >= rows || c >= cols) { dropped++; continue }
    next[`${nr},${c}`] = piece
  }
  state.placement = next
  return dropped
}

async function loadGallery() {
  try { galleryIndex = await fetch('../pieces/gallery-index.json?v=1.0.30').then(r => r.json()) }
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

function showHoverMoves(key) {
  if (!isGrid(state)) return
  const fenChar = state.placement[key]
  if (!fenChar) return
  const spec = getSpecForFenChar(fenChar)
  if (!spec) return
  const { rows, cols } = state.topology
  const [r, c] = key.split(',').map(Number)
  const moverIsUpper = fenChar === fenChar.toUpperCase()
  const board = boardFromPlacement(state.placement, rows, cols, moverIsUpper)
  const moves = movesForSpec(spec, { rows, cols, from: r * cols + c, board })
  if (!moves) return
  paintDots($('board-svg'), moves, {
    rows, cols,
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
    if (activePiece === '__erase') cell.style.cursor = state.placement[sqToPlacementKey(sq)] ? 'pointer' : 'default'
    else if (activePiece) cell.style.cursor = 'copy'
    else cell.style.cursor = 'default'
  })
}

// --- setup bar ---

function syncSetupInput() {
  const input = $('setup-input')
  if (!input || document.activeElement === input) return
  input.classList.remove('is-invalid')
  input.value = Object.keys(state.placement).length ? buildSetup(state) : ''
}

function applySetupInput(text) {
  const input = $('setup-input')
  const next = parseSetup(text, {
    type: state.topology.type,
    rows: state.topology.rows,
    cols: state.topology.cols,
  })
  if (next === null) { input.classList.add('is-invalid'); return false }
  pieceHistory.push({ replaceAll: { ...state.placement } })
  state.placement = next
  input.classList.remove('is-invalid')
  render()
  updateInfoText()
  return true
}

function updateInfoText() {
  const count = Object.keys(state.placement).length
  const el = $('info-text')
  const prefix = count > 0 ? `${count} piece${count !== 1 ? 's' : ''} placed · ` : ''
  if (activePiece && activePiece !== '__erase') {
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

function selectPiece(sym, src) {
  activePiece = activePiece === sym ? null : sym
  activePieceSrc = activePiece ? (src || null) : null
  buildPiecePicker()
  updateInfoText()
  updateCursors()
}

function buildPiecePicker() {
  const setId = state.pieceSet
  const picker = $('piece-picker')
  $('piece-palette').style.display = ''
  if (!setId) {
    activePiece = null
    picker.innerHTML = '<div class="piece-hint">Choose a piece set above to start placing pieces.</div>'
    $('active-piece-label').textContent = ''
    return
  }

  const setDef = galleryIndex?.find(s => s.id === setId)
  if (!setDef || !setDef.pieces) { picker.innerHTML = ''; return }

  picker.innerHTML = ''
  const entries = paletteEntries(setDef)
  if (!entries.length) {
    picker.innerHTML = '<div class="piece-hint">This set names its pieces in a way the editor cannot yet map to board symbols, so there is nothing to place from it. Pick another set, or define a piece by hand below. Tracked in engine#118.</div>'
    $('active-piece-label').textContent = ''
    activePiece = null
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
      for (const [sym, label] of [[cp.symbolW, cp.name + ' (W)'], [cp.symbolB, cp.name + ' (b)']]) {
        const btn = document.createElement('button')
        btn.className = 'piece-btn' + (activePiece === sym ? ' active' : '')
        btn.title = label
        btn.textContent = sym
        btn.addEventListener('click', () => selectPiece(sym, null))
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

function buildPieceSpec() {
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
  if (!isGrid(state)) { setStatus('Move preview is grid only (engine#62)'); return }
  const { rows, cols } = state.topology
  const from = Math.floor(rows / 2) * cols + Math.floor(cols / 2)
  const board = new Array(rows * cols).fill(null)
  board[from] = { friendly: true, owner: 0, type: 'preview' }
  const moves = movesForSpec(buildPieceSpec(), { rows, cols, from, board })
  const container = $('board-svg')
  container.querySelectorAll('.move-preview-dot').forEach(el => el.remove())
  if (!moves) { setStatus('That shape does not build'); return }
  paintDots(container, moves, { rows, cols, className: 'move-preview-dot', fill: 'rgba(76, 175, 80, 0.6)', radiusFactor: 0.2 })
  paintDots(container, [from], { rows, cols, className: 'move-preview-dot', fill: 'rgba(33, 150, 243, 0.6)', radiusFactor: 0.25 })
  setStatus(`${moves.length} reachable cell${moves.length === 1 ? '' : 's'}`)
}

function addCustomPiece() {
  const name = val('def-name').trim()
  const symbolW = val('def-symbol-w').trim()
  const symbolB = val('def-symbol-b').trim()
  if (!name || !symbolW || !symbolB) { setStatus('A custom piece needs a name and both symbols'); return }
  state.customPieces.push({ name, symbolW, symbolB, spec: buildPieceSpec() })
  renderCustomPiecesList()
  buildPiecePicker()
  scheduleAutosave()
}

function renderCustomPiecesList() {
  const list = $('custom-pieces-list')
  if (!list) return
  list.innerHTML = ''
  state.customPieces.forEach((p, i) => {
    const row = document.createElement('div')
    row.className = 'custom-piece-row'
    row.innerHTML = `<span class="custom-piece-name">${escapeHtml(p.name)} (${escapeHtml(p.symbolW)}/${escapeHtml(p.symbolB)})</span>`
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
    render()
    updateInfoText()
  })
}

// --- templates ---

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
    const variantMeta = resolved._variantMeta || {}
    const next = stateFromResolved(resolved, templateFamily, {
      title: resolved.meta?.label || slug,
      slug,
      win: variantMeta.win || '',
      special: variantMeta.special || '',
    })
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

function importYaml(text) {
  try {
    const parsed = parseFrontmatter(text)
    if (!parsed?.meta?.engine) {
      setStatus('No engine block found in the imported file')
      return false
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
  const resolved = buildResolvedFromState(state)
  const title = state.title || 'Custom Variant'
  const slug = state.slug || slugify(title)

  const meta = { title, slug }
  if (state.win) meta.win = state.win
  if (state.special) meta.special = state.special

  const engine = { topology: resolved.topology }
  engine.surface = state.render.surface || 'wood-classic'
  if (resolved.render && Object.keys(resolved.render).length) engine.render = resolved.render
  if (resolved.pieces) engine.pieces = resolved.pieces
  if (Object.keys(state.placement || {}).length) engine.setup = buildSetup(state)
  if (resolved.vocabulary && Object.keys(resolved.vocabulary).length) engine.vocabulary = resolved.vocabulary
  if (Array.isArray(resolved.players) && resolved.players.length) engine.players = resolved.players
  const pluginConfig = resolved.plugins?.[state.family] || {}
  if (Object.keys(pluginConfig).length) engine.plugins = { [state.family]: pluginConfig }

  meta.engine = engine
  const yaml = serializeFrontmatter(meta)

  const blob = new Blob([yaml], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(state.title)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function slugify(s) {
  return String(s || 'custom-variant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-variant'
}

// --- topology visibility ---

function showTopoOpts() {
  const type = state.topology.type
  $('grid-opts').style.display = type === 'grid' ? '' : 'none'
  $('hex-opts').style.display = type === 'hex' ? '' : 'none'
  $('graph-opts').style.display = type === 'graph' ? '' : 'none'
  $('track-opts').style.display = type === 'track' ? '' : 'none'
  $('pit-opts').style.display = type === 'pit' ? '' : 'none'
  const intersections = type === 'grid' && state.topology.layout === 'intersections'
  $('cellcolor-group').style.display = type === 'grid' && !intersections ? '' : 'none'
  $('starpoints-group').style.display = intersections ? '' : 'none'
}

function undo() {
  const last = pieceHistory.pop()
  if (!last) return
  if (last.replaceAll) state.placement = last.replaceAll
  else if (last.prev) state.placement[last.sq] = last.prev
  else delete state.placement[last.sq]
  render()
  updateInfoText()
}

function updateTryInPlayState() {
  const btn = $('try-play-btn')
  if (!btn) return
  const grid = isGrid(state)
  btn.disabled = !grid
  btn.title = grid ? '' : 'Only grid boards can be played (engine#62)'
}

function tryInPlay() {
  if (!isGrid(state)) return
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
  readControlsIntoState()
  showTopoOpts()
  render()
  updateInfoText()
  updateTryInPlayState()
}

async function init() {
  await Promise.all([loadGallery(), loadPlayabilityManifest()])
  bindBoard()
  populatePieceSets()
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
    render()
    updateInfoText()
    updateTryInPlayState()
  }
  renderDraftsPanel()
  syncDraftName()

  $('family-select').addEventListener('change', () => {
    state.family = val('family-select')
    state.rules = defaultRuleValues(state.family)
    state.players = defaultPlayers(state.family)
    renderPlayers()
    renderRules()
    onControlChange()
  })

  $('topo-type').addEventListener('change', () => {
    state.placement = {}
    pieceHistory = []
    state.render.inherited = null
    state.render.surfaceColors = null
    state.pieceVocabulary = null
    state.inheritedVocabulary = null
    state.inheritedPieces = null
    const type = val('topo-type')
    const surfaceSelect = $('surface-select')
    if (type === 'pit') surfaceSelect.value = 'earth'
    else if (type === 'graph') surfaceSelect.value = 'parchment'
    else if (type === 'hex' || type === 'track') surfaceSelect.value = 'wood-classic'
    onControlChange()
  })

  for (const id of ['grid-layout', 'star-points', 'hex-radius', 'graph-structure', 'graph-rings',
    'track-positions', 'pit-cols', 'surface-select', 'cellcolor-select', 'labels-select']) {
    $(id)?.addEventListener('change', onControlChange)
  }

  for (const id of ['grid-rows', 'grid-cols']) {
    $(id)?.addEventListener('change', () => {
      const rows = num('grid-rows', 8)
      const cols = num('grid-cols', 8)
      const dropped = lastGrid ? reanchorPlacement(lastGrid.rows, lastGrid.cols, rows, cols) : 0
      lastGrid = { rows, cols }
      onControlChange()
      if (dropped) setStatus(`${dropped} piece${dropped !== 1 ? 's' : ''} did not fit the new board and ${dropped !== 1 ? 'were' : 'was'} removed`)
    })
  }

  $('pieceset-select').addEventListener('change', () => {
    state.pieceSet = val('pieceset-select')
    buildPiecePicker()
    render()
  })

  // Choosing a surface or a cell style is an explicit override, so the loaded
  // variant's own drawing program stops applying at that point.
  for (const id of ['surface-select', 'cellcolor-select', 'grid-layout']) {
    $(id)?.addEventListener('change', () => {
      state.render.inherited = null
      state.render.surfaceColors = null
      onControlChange()
    })
  }

  for (const id of ['meta-title', 'meta-slug', 'meta-win', 'meta-special']) {
    $(id)?.addEventListener('input', () => {
      readControlsIntoState()
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

  const setupInput = $('setup-input')
  setupInput?.addEventListener('change', () => applySetupInput(setupInput.value))
  setupInput?.addEventListener('blur', syncSetupInput)

  $('setup-copy-btn')?.addEventListener('click', () => {
    const value = Object.keys(state.placement).length ? buildSetup(state) : ''
    if (value && navigator.clipboard) navigator.clipboard.writeText(value)
  })

  $('try-play-btn')?.addEventListener('click', tryInPlay)
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
