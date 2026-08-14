import { renderFromEngine, attachPieceImages, pieceIdToFenChar } from '../packages/render/src/render-engine.js'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'

let galleryIndex = null
let placement = {}
let activePiece = null
let pieceHistory = []
let lastGrid = null

// Placement is keyed "row,col". Resizing the board used to leave every piece on
// its old row and column while the board grew or shrank around it, silently
// discarding anything that fell outside. Reanchor from the bottom-left instead,
// which is where a setup is conventionally read from, and report any piece that
// genuinely cannot fit.
function reanchorPlacement(oldRows, oldCols, rows, cols) {
  if (!oldRows || !oldCols) return 0
  if (oldRows === rows && oldCols === cols) return 0
  const next = {}
  let dropped = 0
  for (const [key, piece] of Object.entries(placement)) {
    const [r, c] = key.split(',').map(Number)
    const fromBottom = oldRows - 1 - r
    const nr = rows - 1 - fromBottom
    if (nr < 0 || nr >= rows || c >= cols) { dropped++; continue }
    next[`${nr},${c}`] = piece
  }
  placement = next
  return dropped
}

async function loadGallery() {
  try { galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()) }
  catch { galleryIndex = [] }
}

function getTopoType() { return document.getElementById('topo-type').value }

function buildResolved() {
  const type = getTopoType()
  const surfaceRef = document.getElementById('surface-select').value
  const surface = resolveSurface(surfaceRef)
  const labels = document.getElementById('labels-select').value === 'true'

  const topology = { type }
  const render = { labels }

  if (type === 'grid') {
    topology.rows = parseInt(document.getElementById('grid-rows').value) || 8
    topology.cols = parseInt(document.getElementById('grid-cols').value) || 8
    render.cellColor = document.getElementById('cellcolor-select').value
  } else if (type === 'hex') {
    topology.radius = parseInt(document.getElementById('hex-radius').value) || 5
  } else if (type === 'graph') {
    topology.structure = document.getElementById('graph-structure').value
    topology.params = { rings: parseInt(document.getElementById('graph-rings').value) || 3 }
  } else if (type === 'track') {
    topology.positions = parseInt(document.getElementById('track-positions').value) || 24
    render.trackStyle = 'triangular-points'
  } else if (type === 'pit') {
    topology.cols = parseInt(document.getElementById('pit-cols').value) || 6
  }

  const pieceSetId = document.getElementById('pieceset-select').value
  const pieces = pieceSetId ? { set: pieceSetId } : undefined
  const setup = Object.keys(placement).length > 0 ? buildFen() : undefined

  const variantEngine = { topology, surface: surfaceRef, render }
  if (setup) variantEngine.setup = setup
  if (pieces) variantEngine.pieces = pieces

  const { resolved } = cascadeResolve({
    surface,
    family: { engine: {}, meta: { label: '' } },
    variant: { engine: variantEngine, meta: { label: 'Custom Variant' } },
  })

  return resolved
}

function buildFen() {
  const type = getTopoType()
  if (type === 'grid') {
    const rows = parseInt(document.getElementById('grid-rows').value) || 8
    const cols = parseInt(document.getElementById('grid-cols').value) || 8
    const fenRows = []
    for (let r = 0; r < rows; r++) {
      let row = ''
      let empty = 0
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`
        if (placement[key]) {
          if (empty > 0) { row += empty; empty = 0 }
          row += placement[key]
        } else {
          empty++
        }
      }
      if (empty > 0) row += empty
      fenRows.push(row)
    }
    return fenRows.join('/')
  }
  if (type === 'hex') {
    return Object.entries(placement).map(([k, v]) => `${k}:${v}`).join(',')
  }
  return JSON.stringify(placement)
}

function render() {
  const resolved = buildResolved()
  const container = document.getElementById('board-svg')

  let opts = {}
  if (resolved.pieces?.set && galleryIndex) {
    const result = attachPieceImages(resolved, galleryIndex)
    opts.pieceImages = result.images || {}
    opts.pieceSurfaceMap = result.surfaceMap || {}
    opts.pieceSurface = result.surface || null
  }

  const svg = renderFromEngine(resolved, opts)
  if (svg) {
    container.innerHTML = svg
    bindCellClick()
  } else {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Cannot render this configuration</div>'
  }
}

function bindCellClick() {
  const container = document.getElementById('board-svg')
  container.querySelectorAll('.board-cell').forEach(cell => {
    cell.style.cursor = activePiece ? 'crosshair' : 'default'
    cell.addEventListener('click', () => {
      if (!activePiece) return
      const sq = cell.dataset.sq
      if (!sq) return
      pieceHistory.push({ sq, prev: placement[sq] || null })
      if (activePiece === '__erase' || placement[sq] === activePiece) {
        delete placement[sq]
      } else {
        placement[sq] = activePiece
      }
      render()
      updateInfoText()
    })
  })
}

function syncSetupInput() {
  const input = document.getElementById('setup-input')
  if (!input) return
  if (document.activeElement === input) return
  input.classList.remove('is-invalid')
  input.value = Object.keys(placement).length ? buildFen() : ''
}

// Accept a pasted setup string for grid boards. Anything the board cannot hold
// is rejected outright rather than partially applied, so the box never shows a
// string the board is not actually displaying.
function applySetupInput(text) {
  const input = document.getElementById('setup-input')
  const rows = parseInt(document.getElementById('grid-rows').value) || 8
  const cols = parseInt(document.getElementById('grid-cols').value) || 8
  const next = {}
  const rowStrings = String(text).trim().split('/')
  if (getTopoType() !== 'grid' || rowStrings.length !== rows) {
    input.classList.add('is-invalid')
    return false
  }
  for (let r = 0; r < rows; r++) {
    let c = 0
    const run = rowStrings[r].match(/\d+|[^\d]/g) || []
    for (const token of run) {
      if (/^\d+$/.test(token)) { c += parseInt(token, 10); continue }
      if (c >= cols) { input.classList.add('is-invalid'); return false }
      next[`${r},${c}`] = token
      c++
    }
    if (c !== cols) { input.classList.add('is-invalid'); return false }
  }
  pieceHistory.push({ replaceAll: { ...placement } })
  placement = next
  input.classList.remove('is-invalid')
  render()
  updateInfoText()
  return true
}

function updateInfoText() {
  const count = Object.keys(placement).length
  const text = count > 0
    ? `${count} piece${count !== 1 ? 's' : ''} placed` + (activePiece ? ` · Placing: ${activePiece}` : '')
    : 'Configure board and click cells to place pieces'
  document.getElementById('info-text').textContent = text
  syncSetupInput()
}

function populatePieceSets() {
  const select = document.getElementById('pieceset-select')
  if (!galleryIndex || !galleryIndex.length) return
  const families = [...new Set(galleryIndex.map(s => s.family))].sort()
  for (const fam of families) {
    const sets = galleryIndex.filter(s => s.family === fam)
    const group = document.createElement('optgroup')
    group.label = fam.replace(/-/g, ' ')
    for (const s of sets) {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.name || s.id
      group.appendChild(opt)
    }
    select.appendChild(group)
  }
}

// A gallery set is keyed by piece id (wK, bQ). A setup string is keyed by FEN
// character (K, q). Placing the piece id directly produced spurious pieces and
// column shifts: "bQ7" parsed as a black bishop followed by a white queen.
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

function buildPiecePicker() {
  const setId = document.getElementById('pieceset-select').value
  const palette = document.getElementById('piece-palette')
  const picker = document.getElementById('piece-picker')
  if (!setId) { palette.style.display = 'none'; activePiece = null; return }
  palette.style.display = ''

  const setDef = galleryIndex?.find(s => s.id === setId)
  if (!setDef || !setDef.pieces) { picker.innerHTML = ''; return }

  picker.innerHTML = ''
  const entries = paletteEntries(setDef)

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
      btn.addEventListener('click', () => {
        activePiece = activePiece === e.fenChar ? null : e.fenChar
        buildPiecePicker()
        updateInfoText()
        bindCellClick()
      })
      row.appendChild(btn)
    }
    picker.appendChild(row)
  }

  const eraser = document.createElement('button')
  eraser.className = 'piece-btn piece-btn--eraser' + (activePiece === '__erase' ? ' active' : '')
  eraser.title = 'Eraser: click a cell to clear it'
  eraser.textContent = 'Erase'
  eraser.addEventListener('click', () => {
    activePiece = activePiece === '__erase' ? null : '__erase'
    buildPiecePicker()
    updateInfoText()
    bindCellClick()
  })
  picker.appendChild(eraser)

  const label = activePiece === '__erase' ? '(eraser)' : activePiece ? `(${activePiece})` : ''
  document.getElementById('active-piece-label').textContent = label
}

function exportYaml() {
  const type = getTopoType()
  const surface = document.getElementById('surface-select').value
  const labels = document.getElementById('labels-select').value === 'true'
  const pieceSet = document.getElementById('pieceset-select').value

  let lines = ['---', 'title: Custom Variant', 'engine:']
  lines.push('  topology:')
  lines.push(`    type: ${type}`)

  if (type === 'grid') {
    lines.push(`    rows: ${document.getElementById('grid-rows').value}`)
    lines.push(`    cols: ${document.getElementById('grid-cols').value}`)
  } else if (type === 'hex') {
    lines.push(`    radius: ${document.getElementById('hex-radius').value}`)
  } else if (type === 'graph') {
    lines.push(`    structure: ${document.getElementById('graph-structure').value}`)
    lines.push(`    params:`)
    lines.push(`      rings: ${document.getElementById('graph-rings').value}`)
  } else if (type === 'track') {
    lines.push(`    positions: ${document.getElementById('track-positions').value}`)
  } else if (type === 'pit') {
    lines.push(`    cols: ${document.getElementById('pit-cols').value}`)
  }

  lines.push(`  surface: ${surface}`)
  lines.push('  render:')
  if (type === 'grid') {
    lines.push(`    cellColor: ${document.getElementById('cellcolor-select').value}`)
  }
  if (labels) lines.push('    labels: true')

  if (pieceSet) lines.push(`  pieces:\n    set: ${pieceSet}`)

  const fen = buildFen()
  if (fen && Object.keys(placement).length > 0) {
    lines.push(`  setup: "${fen}"`)
  }

  lines.push('---')

  const yaml = lines.join('\n')
  const blob = new Blob([yaml], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'variant.md'
  a.click()
  URL.revokeObjectURL(url)
}

function exportSvg() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'board.svg'
  a.click()
  URL.revokeObjectURL(url)
}

function showTopoOpts() {
  const type = getTopoType()
  document.getElementById('grid-opts').style.display = type === 'grid' ? '' : 'none'
  document.getElementById('hex-opts').style.display = type === 'hex' ? '' : 'none'
  document.getElementById('graph-opts').style.display = type === 'graph' ? '' : 'none'
  document.getElementById('track-opts').style.display = type === 'track' ? '' : 'none'
  document.getElementById('pit-opts').style.display = type === 'pit' ? '' : 'none'
  document.getElementById('cellcolor-group').style.display = type === 'grid' ? '' : 'none'
}

function undo() {
  const last = pieceHistory.pop()
  if (!last) return
  if (last.replaceAll) {
    placement = last.replaceAll
  } else if (last.prev) {
    placement[last.sq] = last.prev
  } else {
    delete placement[last.sq]
  }
  render()
  updateInfoText()
}

// The page already builds a config in the shape createGameForFamily accepts as
// opts.definition, so handing it to the play page needs a transport, not engine
// work.
function tryInPlay() {
  const resolved = buildResolved()
  try {
    sessionStorage.setItem('moddable:createDraft', JSON.stringify({
      definition: { title: 'Custom', slug: 'custom', engine: resolved },
      createdFrom: 'create',
    }))
  } catch { /* storage unavailable: the play page falls back to standard */ }
  window.location.href = '../play/?family=chess&variant=custom&draft=1'
}

async function init() {
  await loadGallery()
  populatePieceSets()
  showTopoOpts()
  lastGrid = {
    rows: parseInt(document.getElementById('grid-rows')?.value) || 8,
    cols: parseInt(document.getElementById('grid-cols')?.value) || 8,
  }
  render()
  updateInfoText()

  document.getElementById('topo-type').addEventListener('change', () => {
    placement = {}; pieceHistory = []
    showTopoOpts(); render(); updateInfoText()
  })

  const rerenderInputs = ['hex-radius', 'graph-structure', 'graph-rings',
    'track-positions', 'pit-cols', 'surface-select', 'cellcolor-select', 'labels-select']
  for (const id of rerenderInputs) {
    const el = document.getElementById(id)
    if (el) el.addEventListener('change', render)
  }

  for (const id of ['grid-rows', 'grid-cols']) {
    const el = document.getElementById(id)
    if (!el) continue
    el.addEventListener('change', () => {
      const rows = parseInt(document.getElementById('grid-rows').value) || 8
      const cols = parseInt(document.getElementById('grid-cols').value) || 8
      const dropped = lastGrid ? reanchorPlacement(lastGrid.rows, lastGrid.cols, rows, cols) : 0
      lastGrid = { rows, cols }
      render()
      updateInfoText()
      if (dropped) {
        document.getElementById('info-text').textContent =
          `${dropped} piece${dropped !== 1 ? 's' : ''} did not fit the new board and ${dropped !== 1 ? 'were' : 'was'} removed`
      }
    })
  }

  document.getElementById('pieceset-select').addEventListener('change', () => {
    buildPiecePicker(); render()
  })
  document.getElementById('export-yaml-btn').addEventListener('click', exportYaml)
  document.getElementById('export-svg-btn').addEventListener('click', exportSvg)
  document.getElementById('bar-undo-btn').addEventListener('click', undo)

  const setupInput = document.getElementById('setup-input')
  if (setupInput) {
    setupInput.addEventListener('change', () => applySetupInput(setupInput.value))
    setupInput.addEventListener('blur', () => syncSetupInput())
  }
  const copyBtn = document.getElementById('setup-copy-btn')
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const value = Object.keys(placement).length ? buildFen() : ''
      if (value && navigator.clipboard) navigator.clipboard.writeText(value)
    })
  }
  const tryBtn = document.getElementById('try-play-btn')
  if (tryBtn) tryBtn.addEventListener('click', tryInPlay)
  document.getElementById('clear-pieces-btn').addEventListener('click', () => {
    placement = {}; pieceHistory = []; render(); updateInfoText()
  })
}

init()
